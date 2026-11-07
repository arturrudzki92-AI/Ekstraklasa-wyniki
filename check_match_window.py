"""Skip extra 15-minute API calls outside likely live-match windows."""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

def main():
    now = datetime.now(timezone.utc)
    # Regular hourly refresh is unconditional, including manual runs.
    if now.minute in range(15, 25):
        return True
    try:
        data = json.loads(Path('site/data.json').read_text(encoding='utf-8'))
        matches = (data.get('upcoming') or []) + (data.get('results') or [])
        for m in matches:
            status = str(m.get('status') or '').lower()
            if status in {'live','in_progress','playing','1h','2h','ht'}:
                return True
            raw = m.get('date')
            if not raw:
                continue
            dt = datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
            if dt.tzinfo is None:
                # Date without timezone is ambiguous; allow a wider safety window.
                dt = dt.replace(tzinfo=timezone.utc)
                before, after = timedelta(hours=3), timedelta(hours=5)
            else:
                before, after = timedelta(minutes=20), timedelta(hours=3)
            if dt - before <= now <= dt + after:
                return True
    except (OSError, ValueError, TypeError, AttributeError) as exc:
        print('Nie można sprawdzić okna meczu, aktualizuję na wszelki wypadek:', exc)
        return True
    return False

if __name__ == '__main__':
    enabled = main()
    with open(__import__('os').environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as f:
        f.write('run=' + ('true' if enabled else 'false') + '\n')
    print('Aktualizacja API:', enabled)
