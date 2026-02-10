use anyhow::Result;
use yrs::encoding::read::Read as YrsRead;
use yrs::encoding::write::Write as YrsWrite;
use yrs::updates::decoder::{Decode, DecoderV1};
use yrs::updates::encoder::{Encode, Encoder, EncoderV1};
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};

// Yjs sync protocol message types
pub const MSG_SYNC: u8 = 0;
pub const MSG_AWARENESS: u8 = 1;

// Sync steps
pub const MSG_SYNC_STEP1: u8 = 0;
pub const MSG_SYNC_STEP2: u8 = 1;
pub const MSG_SYNC_UPDATE: u8 = 2;

/// Create a sync step 1 message containing our state vector
pub fn create_sync_step1(doc: &Doc) -> Result<Vec<u8>> {
    let txn = doc.transact();
    let sv = txn.state_vector().encode_v1();

    let mut encoder = EncoderV1::new();
    encoder.write_var(MSG_SYNC as u32);
    encoder.write_var(MSG_SYNC_STEP1 as u32);
    encoder.write_buf(&sv);
    Ok(encoder.to_vec())
}

/// Create a sync step 2 message encoding updates since the given state vector
pub fn create_sync_step2(doc: &Doc, remote_sv: &[u8]) -> Result<Vec<u8>> {
    let sv = StateVector::decode_v1(remote_sv)?;
    let txn = doc.transact();
    let update = txn.encode_diff_v1(&sv);

    let mut encoder = EncoderV1::new();
    encoder.write_var(MSG_SYNC as u32);
    encoder.write_var(MSG_SYNC_STEP2 as u32);
    encoder.write_buf(&update);
    Ok(encoder.to_vec())
}

/// Handle an incoming sync message and return an optional response
pub fn handle_sync_message(doc: &Doc, msg: &[u8]) -> Result<Option<Vec<u8>>> {
    if msg.is_empty() {
        return Ok(None);
    }

    let mut decoder = DecoderV1::from(msg);
    let msg_type: u32 = decoder.read_var()?;

    if msg_type != MSG_SYNC as u32 {
        // Not a sync message, skip
        return Ok(None);
    }

    let sync_type: u32 = decoder.read_var()?;

    match sync_type as u8 {
        MSG_SYNC_STEP1 => {
            // Received a state vector, respond with diff
            let sv = decoder.read_buf()?;
            let response = create_sync_step2(doc, sv)?;
            Ok(Some(response))
        }
        MSG_SYNC_STEP2 | MSG_SYNC_UPDATE => {
            // Received an update, apply it
            let update_data = decoder.read_buf()?;
            let update = Update::decode_v1(update_data)?;
            let mut txn = doc.transact_mut();
            txn.apply_update(update)?;
            Ok(None)
        }
        _ => Ok(None),
    }
}

/// Encode full document state for persistence
pub fn encode_doc_state(doc: &Doc) -> Vec<u8> {
    let txn = doc.transact();
    txn.encode_state_as_update_v1(&StateVector::default())
}

/// Load document state from bytes
pub fn load_doc_state(doc: &Doc, state: &[u8]) -> Result<()> {
    let update = Update::decode_v1(state)?;
    let mut txn = doc.transact_mut();
    txn.apply_update(update)?;
    Ok(())
}

/// Create an update message wrapping raw update bytes
pub fn create_update_message(update: &[u8]) -> Vec<u8> {
    let mut encoder = EncoderV1::new();
    encoder.write_var(MSG_SYNC as u32);
    encoder.write_var(MSG_SYNC_UPDATE as u32);
    encoder.write_buf(update);
    encoder.to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;
    use yrs::{Map, Transact};

    #[test]
    fn test_create_sync_step1() {
        let doc = Doc::new();
        let msg = create_sync_step1(&doc).expect("should create sync step 1");
        assert!(!msg.is_empty());
        // First byte should be MSG_SYNC (0)
        assert_eq!(msg[0], MSG_SYNC);
    }

    #[test]
    fn test_encode_and_load_doc_state() {
        let doc1 = Doc::new();
        {
            let map = doc1.get_or_insert_map("test");
            let mut txn = doc1.transact_mut();
            map.insert(&mut txn, "key", "value");
        }

        let state = encode_doc_state(&doc1);
        assert!(!state.is_empty());

        let doc2 = Doc::new();
        load_doc_state(&doc2, &state).expect("should load state");

        let map2 = doc2.get_or_insert_map("test");
        let txn2 = doc2.transact();
        let val = map2.get(&txn2, "key");
        assert!(val.is_some());
    }

    #[test]
    fn test_handle_sync_step1_returns_step2() {
        let doc = Doc::new();
        let step1 = create_sync_step1(&doc).expect("create step1");

        let doc2 = Doc::new();
        let response = handle_sync_message(&doc2, &step1).expect("handle step1");
        assert!(response.is_some(), "step1 should produce a step2 response");
    }

    #[test]
    fn test_handle_empty_message() {
        let doc = Doc::new();
        let result = handle_sync_message(&doc, &[]);
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_handle_non_sync_message() {
        let doc = Doc::new();
        // MSG_AWARENESS = 1, not a sync message
        let result = handle_sync_message(&doc, &[MSG_AWARENESS, 0, 0]);
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_create_update_message() {
        let update_data = vec![1, 2, 3, 4];
        let msg = create_update_message(&update_data);
        assert!(!msg.is_empty());
        assert_eq!(msg[0], MSG_SYNC);
    }

    #[test]
    fn test_load_invalid_state_fails() {
        let doc = Doc::new();
        let result = load_doc_state(&doc, &[0xFF, 0xFF, 0xFF]);
        assert!(result.is_err());
    }

    #[test]
    fn test_roundtrip_sync_protocol() {
        // Create doc1 with some data
        let doc1 = Doc::new();
        {
            let map = doc1.get_or_insert_map("elements");
            let mut txn = doc1.transact_mut();
            map.insert(&mut txn, "el1", "rectangle");
            map.insert(&mut txn, "el2", "circle");
        }

        // doc2 starts empty
        let doc2 = Doc::new();

        // doc2 sends step1 to doc1
        let step1 = create_sync_step1(&doc2).unwrap();
        let response = handle_sync_message(&doc1, &step1).unwrap();
        assert!(response.is_some());

        // doc2 receives step2 and applies it
        let step2 = response.unwrap();
        let result = handle_sync_message(&doc2, &step2).unwrap();
        assert!(result.is_none()); // step2 doesn't generate a response

        // Verify doc2 now has the data
        let map2 = doc2.get_or_insert_map("elements");
        let txn2 = doc2.transact();
        assert!(map2.get(&txn2, "el1").is_some());
        assert!(map2.get(&txn2, "el2").is_some());
    }
}
