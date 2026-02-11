#!/bin/bash
# Opret Beads tasks fra uløste fejl i error_log
# Kør periodisk (cron) eller manuelt: ./scripts/errors-to-beads.sh

set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://whiteboard:password@localhost:5432/whiteboard}"

echo "🔍 Checker for uløste fejl..."

psql "$DB_URL" -t -A -F'|' -c "
    SELECT
        error_type,
        LEFT(message, 200),
        source,
        severity,
        COUNT(*) as count,
        MIN(created_at)::text as first_seen,
        MAX(created_at)::text as last_seen
    FROM error_log
    WHERE resolved = FALSE
      AND bead_id IS NULL
      AND severity IN ('error', 'critical')
    GROUP BY error_type, LEFT(message, 200), source, severity
    HAVING COUNT(*) >= 1
    ORDER BY
        CASE severity WHEN 'critical' THEN 0 ELSE 1 END,
        COUNT(*) DESC
    LIMIT 20;
" | while IFS='|' read -r error_type message source severity count first_seen last_seen; do

    # Skip tomme linjer
    [ -z "$error_type" ] && continue

    # Bestem priority
    priority=2
    if [ "$severity" = "critical" ]; then
        priority=0
    elif [ "$count" -gt 10 ]; then
        priority=1
    fi

    # Truncate message til bead titel
    title="Bug: [$source/$error_type] ${message:0:80}"

    description="Automatisk oprettet fra error_log.
Severity: $severity
Source: $source
Type: $error_type
Occurrences: $count
First seen: $first_seen
Last seen: $last_seen
Message: $message"

    echo "📝 Opretter bead: $title (P$priority, $count forekomster)"

    # Opret bead
    bead_output=$(bd create --title="$title" --type=bug --priority="$priority" --description="$description" 2>&1) || true
    bead_id=$(echo "$bead_output" | grep -oP 'udstillerguide-whiteboard-\S+' | head -1)

    if [ -n "$bead_id" ]; then
        # Marker fejl som tracked i DB
        escaped_type=$(echo "$error_type" | sed "s/'/''/g")
        escaped_msg=$(echo "$message" | sed "s/'/''/g")
        psql "$DB_URL" -c "
            UPDATE error_log
            SET bead_id = '$bead_id'
            WHERE resolved = FALSE
              AND error_type = '$escaped_type'
              AND LEFT(message, 200) = '$escaped_msg'
              AND source = '$source';
        " > /dev/null

        echo "  ✅ Bead: $bead_id"
    else
        echo "  ❌ Kunne ikke oprette bead"
    fi
done

echo "✅ Færdig!"
