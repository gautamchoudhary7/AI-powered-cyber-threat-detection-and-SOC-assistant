---
title: "#StopRansomware Guide"
publisher: CISA
url: https://www.cisa.gov/stopransomware/ransomware-guide
reference: CISA ransomware guide
---

## Part 2: Ransomware and Data Extortion Response Checklist

Should your organization be a victim of ransomware, follow your approved IRP. The authoring organizations strongly recommend responding by using the following checklist. Be sure to move through the first three steps in sequence.

## Detection and Analysis

Refer to the best practices and references below to help manage the risk posed by ransomware and support your organization’s coordinated and efficient response to a ransomware incident. Apply these practices to the greatest extent possible based on availability of organizational resources.
Determine which systems were impacted, and immediately isolate them.
If several systems or subnets appear impacted, take the network offline at the switch level. It may not be feasible to disconnect individual systems during an incident.
Prioritize isolating critical systems that are essential to daily operations.
If taking the network temporarily offline is not immediately possible, locate the network cable (e.g., ethernet) and unplug affected devices from the network or remove them from Wi-Fi to contain the infection.
For cloud resources, take a snapshot of volumes to get a point in time copy for reviewing later for forensic investigation.
After an initial compromise, malicious actors may monitor your organization’s activity or communications to understand if their actions have been detected. Isolate systems in a coordinated manner and use out-of-band communication methods such as phone calls to avoid tipping off actors that they have been discovered and that mitigation actions are being undertaken. Not doing so could cause actors to move laterally to preserve their access or deploy ransomware widely prior to networks being taken offline.
Power down devices if you are unable to disconnect them from the network to avoid further spread of the ransomware infection.
Note: This step will prevent your organization from maintaining ransomware infection artifacts and potential evidence stored in volatile memory. It should be carried out only if it is not possible to temporarily shut down the network or disconnect affected hosts from the network using other means.
Triage impacted systems for restoration and recovery.
Identify and prioritize critical systems for restoration on a clean network and confirm the nature of data housed on impacted systems.
Prioritize restoration and recovery based on a predefined critical asset list that includes information systems critical for health and safety, revenue generation, or other critical services, as well as systems they depend on.
Keep track of systems and devices that are not perceived to be impacted so they can be deprioritized for restoration and recovery. This enables your organization to get back to business in a more efficient manner.
Examine existing organizational detection or prevention systems (e.g., antivirus, EDR, IDS, Intrusion Prevention System) and logs. Doing so can highlight evidence of additional systems or malware involved in earlier stages of the attack.
Look for evidence of precursor “dropper” malware, such as Bumblebee, Dridex, Emotet, QakBot, or Anchor. A ransomware event may be evidence of a previous, unresolved network compromise.
Operators of these advanced malware variants will often sell access to a network. Malicious actors will sometimes use this access to exfiltrate data and then threaten to release the data publicly before ransoming the network to further extort the victim and pressure them into paying.
Malicious actors often drop ransomware variants to obscure post-compromise activity. Care must be taken to identify such dropper malware before rebuilding from backups to prevent continuing compromises.
Confer with your team to develop and document an initial understanding of what has occurred based on initial analysis.
Initiate threat hunting activities.
For enterprise environments, check for:
Newly created AD accounts or accounts with escalated privileges and recent activity related to privileged accounts such as Domain Admins.
Anomalous VPN device logins or other suspicious logins.
Endpoint modifications that may impair backups, shadow copy, disk journaling, or boot configurations. Look for anomalous usage of built-in Windows tools such as bcdedit.exe, fsutil.exe (deletejournal), vssadmin.exe, wbadmin.exe, and wmic.exe (shadowcopy or shadowstorage). Misuse of these tools is a common ransomware technique to inhibit system recovery.
Signs of the presence of Cobalt Strike beacon/client. Cobalt Strike is a commercial penetration testing software suite. Malicious actors often name Cobalt Strike Windows processes with the same names as legitimate Windows processes to obfuscate their presence and complicate investigations.
Signs of any unexpected usage of remote monitoring and management (RMM) software (including portable executables that are not installed). RMM software is commonly used by malicious actors to maintain persistence.
Any unexpected PowerShell execution or use of PsTools suite.
Signs of enumeration of AD and/or LSASS credentials being dumped (e.g., Mimikatz or NTDSutil.exe).
Signs of unexpected endpoint-to-endpoint (including servers) communications.
Potential signs of data being exfiltrated from the network, which may include:
Abnormal amount of data outgoing over any port. Open source software can tunnel data over various ports and protocols. For example, ransomware actors have used Chisel to tunnel Secure Shell (SSH) over HTTPS port 443. Ransomware actors have also used Cloudflared to abuse Cloudflare tunnels to tunnel communications over HTTPS.
Common tools for data exfiltration include Rclone, Rsync, various web-based file storage services (also used by threat actors to implant malware/tools on the affected network), and FTP/SFTP.
Newly created services, unexpected scheduled tasks, unexpected software installed, etc.
For cloud environments:
Enable tools to detect and prevent modifications to IAM, network security, and data protection resources.
Use automation to detect common issues (e.g., disabling features, introduction of new firewall rules) and take automated actions as soon as they occur. For example, if a new firewall rule is created that allows open traffic (0.0.0.0/0), an automated action can be taken to disable or delete this rule and send notifications to the user that created it as well as the security team for awareness. This will help avoid alert fatigue and allow security personnel to focus on critical issues.

## Reporting and Notification

Note: Refer to the Contact Information section at the end of this guide for details on how to report and notify about ransomware incidents.
Follow notification requirements as outlined in your cyber incident response and communications plan to engage internal and external teams and stakeholders with an understanding of what they can provide to help you mitigate, respond to, and recover from the incident.
Share the information you have at your disposal to receive timely and relevant assistance. Keep management and senior leaders informed via regular updates as the situation develops. Relevant stakeholders may include your IT department, managed security service providers, cyber insurance company, and departmental or elected leaders [CPG 4.A].
Report the incident to—and consider requesting assistance from—CISA, your local FBI field office, the FBI Internet Crime Complaint Center (IC3), or your local U.S. Secret Service field office.
As appropriate, coordinate with communications and public information personnel to ensure accurate information is shared internally with your organization and externally with the public.
If the incident resulted in a data breach, follow notification requirements as outlined in your cyber incident response and communications plans.

## Containment and Eradication

If no initial mitigation actions appear possible:
Take a system image and memory capture of a sample of affected devices (e.g., workstations, servers, virtual servers, and cloud servers). Collect any relevant logs as well as samples of any “precursor” malware binaries and associated observables or indicators of compromise (e.g., suspected command and control IP addresses, suspicious registry entries, or other relevant files detected). The contacts below may be able to assist you in performing these tasks.
Preserve evidence that is highly volatile in nature—or limited in retention—to prevent loss or tampering (e.g., system memory, Windows Security logs, data in firewall log buffers).
Consult federal law enforcement, even if mitigation actions are possible, regarding possible decryptors available, as security researchers may have discovered encryption flaws for some ransomware variants and released decryption or other types of tools.
To continue steps to contain and mitigate the incident:
Research trusted guidance (e.g., published by sources such as the U.S. Government, MS-ISAC, or a reputable security vendor) for the particular ransomware variant and follow any additional recommended steps to identify and contain systems or networks that are confirmed to be impacted.
Kill or disable the execution of known ransomware binaries; this will minimize damage and impact to your systems. Delete other known associated registry values and files.
Identify the systems and accounts involved in the initial breach. This can include email accounts.
Based on the breach or compromise details determined above, contain associated systems that may be used for further or continued unauthorized access. Breaches often involve mass credential exfiltration. Securing networks and other information sources from continued credential-based unauthorized access may include:
Disable virtual private networks, remote access servers, single sign-on resources, and cloud-based or other public-facing assets.
If server-side data is being encrypted by an infected workstation, follow server-side data encryption quick identification steps.
Review Computer Management > Sessions and Open Files lists on associated servers to determine the user or system accessing those files.
Review file properties of encrypted files or ransom notes to identify specific users that may be associated with file ownership.
Review the TerminalServices-RemoteConnectionManager event log to check for successful RDP network connections.
Review the Windows Security log, SMB event logs, and related logs that may identify significant authentication or access events.
Run packet capture software, such as Wireshark, on the impacted server with a filter to identify IP addresses involved in actively writing or renaming files (e.g., smb2.filename contains cryptxxx).
Conduct extended analysis to identify outside-in and inside-out persistence mechanisms.
Outside-in persistence may include authenticated access to external systems via rogue accounts, backdoors on perimeter systems, exploitation of external vulnerabilities, etc.
Inside-out persistence may include malware implants on the internal network or a variety of living-off-the-land style modifications (e.g., use of commercial penetration testing tools like Cobalt Strike; use of PsTools suite, including PsExec, to remotely install and control malware and gather information regarding—or perform remote management of—Windows systems; use of PowerShell scripts).
Identification may involve deployment of EDR solutions, audits of local and domain accounts, examination of data found in centralized logging systems, or deeper forensic analysis of specific systems once movement within the environment has been mapped out.
Rebuild systems based on prioritization of critical services (e.g., health and safety or revenue-generating services), using pre-configured standard images, if possible. Use infrastructure as code templates to rebuild cloud resources.
Issue password resets for all affected systems and address any associated vulnerabilities and gaps in security or visibility once the environment has been fully cleaned and rebuilt, including any associated impacted accounts and the removal or remediation of malicious persistence mechanisms. This can include applying patches, upgrading software, and taking other security precautions not previously taken. Update customer-managed encryption keys as needed.
The designated IT or IT security authority declares the ransomware incident over based on established criteria, which may include taking the steps above or seeking outside assistance.

## Recovery and Post Incident Activity

Reconnect systems and restore data from offline, encrypted backups based on a prioritization of critical services.
Take care not to re-infect clean systems during recovery. For example, if a new Virtual Local Area Network (VLAN) has been created for recovery purposes, ensure only clean systems are added.
Document lessons learned from the incident and associated response activities to inform updates to—and refine—organizational policies, plans, and procedures and guide future exercises of the same.
Consider sharing lessons learned and relevant indicators of compromise with CISA or your sector ISAC to benefit others within the community.

## Prevention: compromised credentials and phishing


### Initial Access Vector: Compromised Credentials

Implement phishing-resistant MFA for all services, particularly for email, VPNs, and accounts that access critical systems [CPG 2.H]. Escalate to senior management upon discovery of systems that do not allow MFA, systems that do not enforce MFA, and any users who are not enrolled with MFA.
Consider employing password-less MFA that replace passwords with two or more verification factors (e.g., a fingerprint, facial recognition, device pin, or a cryptographic key).
Consider subscribing to credential monitoring services that monitor the dark web for compromised credentials.
Implement identity and access management (IAM) systems to provide administrators with the tools and technologies to monitor and manage roles and access privileges of individual network entities for on-premises and cloud applications.
Implement zero trust access control by creating strong access policies to restrict user to resource access and resource-to-resource access. This is important for key management resources in the cloud.
Change default admin usernames and passwords. [CPG 2.A].
Do not use root access accounts for day-to-day operations. Create users, groups, and roles to carry out tasks.
Implement password policies that require unique passwords of at least 15 characters. [CPG 2.B] [CPG 2.C].
Password managers can help you develop and manage secure passwords. Secure and limit access to any password managers in use and enable all security features available on the product in use, such as MFA.
Enforce account lockout policies after a certain number of failed login attempts. Log and monitor login attempts for brute force password cracking and password spraying [CPG 2.G].
Store passwords in a secured database and use strong hashing algorithms.
Disable saving passwords to the browser in the Group Policy Management console.
Implement Local Administrator Password Solution (LAPS) where possible if your OS is older than Windows Server 2019 and Windows 10 as these versions do not have LAPS built in. Note: The authoring organizations recommend organizations upgrade to Windows Server 2019 and Windows 10 or greater.
Protect against Local Security Authority Subsystem Service (LSASS) dumping:
Implement the Attack Surface Reduction (ASR) rule for LSASS.
Implement Credential Guard for Windows 10 and Server 2016. Refer to Microsoft Manage Windows Defender Credential Guard for more information. For Windows Server 2012R2, enable Protected Process Light (PPL) for Local Security Authority (LSA).
Educate all employees on proper password security in your annual security training to include emphasizing not reusing passwords and not saving passwords in local files.
Use Windows PowerShell Remoting, Remote Credential Guard, or RDP with restricted Admin Mode as feasible when establishing a remote connection to avoid direct exposure of credentials.
Separate administrator accounts from user accounts [CPG 2.E]. Only allow designated admin accounts to be used for admin purposes. If an individual user needs administrative rights over their workstation, use a separate account that does not have administrative access to other hosts, such as servers. For some cloud environments, separate duties when the account used to provision/manage keys does not have permission to use the keys and vice versa. As this strategy introduces additional management overhead, it is not appropriate in all environments.

### Initial Access Vector: Phishing

Implement a cybersecurity user awareness and training program that includes guidance on how to identify and report suspicious activity (e.g., phishing) or incidents [CPG 2.I].
Implement flagging external emails in email clients.
Implement filters at the email gateway to filter out emails with known malicious indicators, such as known malicious subject lines, and block suspicious Internet Protocol (IP) addresses at the firewall [CPG 2.M].
Enable common attachment filters to restrict file types that commonly contain malware and should not be sent by email. For more information, refer to Microsoft’s post Anti-malware protection in EOP.
Review file types in your filter list at least semi-annually and add additional file types that have become attack vectors. For example, OneNote attachments with embedded malware have recently been used in phishing campaigns.
Malware is often compressed in password protected archives that evade antivirus scanning and email filters.
Implement Domain-based Message Authentication, Reporting and Conformance (DMARC) policy and verification to lower the chance of spoofed or modified emails from valid domains. DMARC protects your domain from being spoofed but does not protect from incoming emails that have been spoofed unless the sending domain also implements DMARC. DMARC builds on the widely deployed Sender Policy Framework (SPF) and Domain Keys Identified Mail (DKIM) protocols, adding a reporting function that allows senders and receivers to improve and monitor protection of the domain from fraudulent email. For more information on DMARC, refer to CISA Insights Enhance Email & Web Security and the Center for Internet Security’s blog How DMARC Advances Email Security.
Ensure macro scripts are disabled for Microsoft Office files transmitted via email. These macros can be used to deliver ransomware [CPG 2.N]. Note: Recent versions of Office are configured by default to block files that contain Visual Basic for Applications (VBA) macros and display a Trust Bar with a warning that macros are present and have been disabled. For more information, refer to Microsoft’s Macros from the internet will be blocked by default in Office. See Microsoft’s Block macros from running in Office files from the Internet for configuration instructions to disable macros in external files for earlier versions of Office.
Disable Windows Script Host (WSH). Windows script hosting provides an environment in which users can execute scripts or perform tasks.
