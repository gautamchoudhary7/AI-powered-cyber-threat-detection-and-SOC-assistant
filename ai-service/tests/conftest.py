import pytest

HEADER = "---\ntitle: {title}\npublisher: {publisher}\nurl: {url}\n{extra}---\n"

RANSOM = """# Ransomware response

## Containment

Isolate affected hosts from the network immediately. Disconnect infected machines but do not power them off,
because volatile memory may hold evidence that investigators need later.

## Recovery

Restore systems from clean offline backups after the intrusion has been removed and credentials have been reset.
"""

SCANNING = """# Port scanning

## What it looks like

Reconnaissance often appears as many short connection attempts to different ports on one host. A scanner probes
ports one after another to learn which services are listening.
"""


def write_doc(folder, name, title="A Title", publisher="Some Publisher", url="https://example.org/doc", body=RANSOM, extra=""):
    path = folder / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(HEADER.format(title=title, publisher=publisher, url=url, extra=extra) + body, encoding="utf-8")
    return path


@pytest.fixture
def knowledge(tmp_path):
    folder = tmp_path / "knowledge"
    write_doc(folder, "ransomware.md", "Ransomware Guide", "CISA", "https://example.org/ransomware", RANSOM, "reference: Guide 1\n")
    write_doc(folder, "sub/scanning.txt", "Scanning Notes", "MITRE", "https://example.org/scan", SCANNING)
    return folder
