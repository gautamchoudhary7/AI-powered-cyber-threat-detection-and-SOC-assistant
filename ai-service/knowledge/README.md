# Knowledge folder

Put the documents the assistant may quote here, one `.md` or `.txt` file each, then run `python -m app.ingest`.

## Every file must start with a source header

```
---
title: Computer Security Incident Handling Guide
publisher: NIST
url: https://csrc.nist.gov/pubs/sp/800/61/r2/final
reference: SP 800-61 Rev. 2
---
(the text of the document or the sections you want to include, as plain text or Markdown)
```

- `title`, `publisher` and `url` are required. A file without them is **skipped** and listed in the ingest output,
  so nothing can be shown to a user without a citation.
- `url` must start with `http://` or `https://` (or be the word `local` for your own notes).
- Headings written as `## Heading` are remembered and shown with each citation.

## Where to get material (you download it; this project does not bundle third-party text)

The code was written in an environment with no internet access to these sites, so none of the documents below
have been fetched or checked. Open each page, check its **current** address and its terms of use, then copy the
parts you need into a file with the header above. Keep the publisher's name and link exactly right.

| Publisher | Starting point | Useful for |
|-----------|----------------|------------|
| NIST | https://csrc.nist.gov/ (search "incident handling", SP 800-61) | Incident response phases and playbook structure |
| CISA | https://www.cisa.gov/ (search "ransomware guide", "known exploited vulnerabilities") | Practical response steps and advisories |
| MITRE | https://attack.mitre.org/ (technique and tactic pages) | Names and descriptions of attacker techniques |

Check each publisher's licence or terms before copying large amounts of text. Short excerpts with a clear link back are the safest.

## Files already here

`project/unsw-nb15-attack-categories.md` is written by the project team as study notes. It is labelled
`publisher: Project team (own notes)`, so it is never presented as an official source.
