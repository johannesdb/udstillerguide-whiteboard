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
