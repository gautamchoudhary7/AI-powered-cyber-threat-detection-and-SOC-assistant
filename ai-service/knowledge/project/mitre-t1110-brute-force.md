---
title: "Brute Force (T1110)"
publisher: MITRE
url: https://attack.mitre.org/techniques/T1110/
reference: MITRE ATT&CK T1110
---

## Brute Force (T1110) - description

Adversaries may use brute force techniques to gain access to accounts when passwords are unknown or when password hashes are obtained. Without knowledge of the password for an account or set of accounts, an adversary may systematically guess the password using a repetitive or iterative mechanism. Brute forcing passwords can take place via interaction with a service that will check the validity of those credentials or offline against previously acquired credential data, such as password hashes.
Brute forcing credentials may take place at various points during a breach. For example, adversaries may attempt to brute force access to Valid Accounts within a victim environment leveraging knowledge gathered from other post-compromise behaviors such as OS Credential Dumping, Account Discovery, or Password Policy Discovery. Adversaries may also combine brute forcing activity with behaviors such as External Remote Services as part of Initial Access.
If an adversary guesses the correct password but fails to log in to a compromised account due to location-based conditional access policies, they may change their infrastructure until they match the victim’s location and therefore bypass those policies.

## Key facts

- ID: T1110
- Sub-techniques:  T1110.001, T1110.002, T1110.003, T1110.004
- Tactic: Credential Access
- Platforms: Containers, ESXi, IaaS, Identity Provider, Linux, Network Devices, Office Suite, SaaS, Windows, macOS

## Mitigations

- Account Use Policies: Set account lockout policies after a certain number of failed login attempts to prevent passwords from being guessed. Too strict a policy may create a denial of service condition and render environments un-usable, with all accounts used in the brute force being locked-out. Use conditional access policies to block logins from non-compliant devices or from outside defined organization IP ranges. Consider blocking risky authentication requests, such as those originating from anonymizing services/proxies.
- Multi-factor Authentication: Use multi-factor authentication. Where possible, also enable multi-factor authentication on externally facing services.
- Password Policies: Refer to NIST guidelines when creating password policies.
- User Account Management: Proactively reset accounts that are known to be part of breached credentials either immediately, or after detecting bruteforce attempts.

## Detection

- High volume of failed logon attempts followed by a successful one from a suspicious user, host, or timeframe
- Multiple authentication failures for valid or invalid users followed by success from same IP/user
- Password spraying or brute force attempts across user pool within short time intervals
- Multiple failed authentications in unified logs (e.g., loginwindow or sshd)
- Excessive login attempts followed by success from SaaS apps like O365, Dropbox, etc.
