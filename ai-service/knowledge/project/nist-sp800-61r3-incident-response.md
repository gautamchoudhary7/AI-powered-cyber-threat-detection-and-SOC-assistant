---
title: "NIST SP 800-61 Rev. 3: Incident Response Recommendations and Considerations"
publisher: NIST
url: https://csrc.nist.gov/pubs/sp/800/61/r3/final
reference: NIST SP 800-61 Rev. 3
---

## 2.1 Incident Response Life Cycle Model

Fig. 1 depicts the incident response life cycle model illustrated in the previous version of this
publication [SP800-61r2].
At that time, incidents were relatively rare, the scope of most incidents was narrow and welldefined, and incident response and recovery was usually completed within a day or two. Under
those conditions, it was realistic to treat incident response as a separate set of activities
performed by a separate team of personnel and to depict all incident response activities as part
of a circular life cycle. Formal post-incident activities would identify needed improvements and
feed them into the preparation stage, thus starting the cycle again. Incident response activities
were typically intermittent rather than continuous.
However, the current state of incident response has greatly changed since then. Today,
incidents occur frequently and cause far more damage. Recovering from them often takes
weeks or months due to their breadth, complexity, and dynamic nature. Incident response is
now considered a critical part of cybersecurity risk management that should be integrated
across organizational operations. The lessons learned during incident response should often be
shared as soon as they are identified, not delayed until after recovery concludes. Continuous
improvement is increasingly necessary for all facets of cybersecurity risk management in order
to keep up with modern threats.
Fig. 2 shows a high-level incident response life cycle model based on the six CSF 2.0 Functions,
which organize cybersecurity outcomes at their highest level:
• Govern (GV): The organization’s cybersecurity risk management strategy, expectations,
and policy are established, communicated, and monitored.
• Identify (ID): The organization’s current cybersecurity risks are understood.
• Protect (PR): Safeguards to manage the organization’s cybersecurity risks are used.
• Detect (DE): Possible cybersecurity attacks and compromises are found and analyzed.
• Respond (RS): Actions regarding a detected cybersecurity incident are taken.
• Recover (RC): Assets and operations affected by a cybersecurity incident are restored.
All six Functions have vital roles in incident response. Govern, Identify, and Protect help
organizations prevent some incidents, prepare to handle incidents that do occur, reduce the
impact of those incidents, and improve incident response and cybersecurity risk management
practices based on lessons learned. Detect, Respond, and Recover help organizations discover,
manage, prioritize, contain, eradicate, and recover from cybersecurity incidents, as well as
perform incident reporting, notification, and other incident-related communications.
The bottom level reflects that the preparation activities of Govern, Identify, and Protect are not
part of the incident response itself. Rather, they are much broader cybersecurity risk
management activities that also support incident response. Incident response is shown in the
top level of the figure: Detect, Respond, and Recover. Additionally, the need for continuous
improvement is indicated as the middle level with the Improvement Category (ID.IM) within the
Identify Function and the dashed green lines. Lessons learned from performing all activities in
all Functions are fed into Improvement, and those lessons are analyzed, prioritized, and used to
inform all of the Functions. This reflects that organizations can learn new lessons at all times
(e.g., detecting the presence of a new threat and characterizing its behavior) and communicate
those lessons to the appropriate personnel so that the organization’s incident response and
other cybersecurity risk management policies, processes, and practices can be adjusted as
needed.
Table 1 maps the previous SP 800-61 incident response life cycle model’s phases to the
corresponding CSF 2.0 Functions used in this document.
Table 1. Previous incident response life cycle model’s phases and corresponding CSF 2.0 Functions
Previous Incident Response Life Cycle Model Phase CSF 2.0 Functions
Preparation
Govern
Identify (all Categories)
Protect
Detection & Analysis
Detect
Identify (Improvement Category)
Containment, Eradication & Recovery
Respond
Recover
Identify (Improvement Category)
Post-Incident Activity Identify (Improvement Category)
Organizations should use the incident response life cycle framework or model that suits them
best. The model in this document is based on CSF 2.0 to take advantage of the wealth of
resources available for CSF 2.0 and aid organizations that are already using the CSF. The
appropriate incident response life cycle framework or model for an organization depends on
many factors; for example, larger and more technology-dependent organizations are likely to
benefit more from using a framework or model emphasizing continuous improvement than
other organizations would. Regardless of the incident response life cycle framework or model
used, every organization should take incident response into consideration throughout their
cybersecurity risk management activities.

## 3.2 Incident Response: Detect (DE)

elements in this part have recommendations or considerations.
Table 3. CSF 2.0 Community Profile part 2: Incident Response
DE (Detect) Possible cybersecurity attacks
and compromises are found and
analyzed
High N1: The Detect Function encompasses all of
the monitoring and analysis activities
performed to find and characterize
potentially adverse events and, in turn, find
cybersecurity incidents.
DE.CM
(Continuous
Monitoring)
Assets are monitored to find
anomalies, indicators of
compromise, and other
potentially adverse events
High R1: Continuous monitoring for
unauthorized activity, deviations from
expected activity, and changes in security
posture should involve the following types
of assets at all times: networks and
network services; computing hardware and
software, runtime environments, and their
data; the physical environment; personnel
activity and technology usage; and external
service provider activities.
C1: Consider using cyber threat information
with continuous monitoring to help identify
potentially malicious activities that may
have otherwise been considered benign.
R2: Tune the continuous monitoring
technologies to reduce false positives and
false negatives to acceptable levels.
DE.CM-01 Networks and network services
are monitored to find potentially
adverse events
High R1: Monitoring should include wired and
wireless networks, network
communications and flows, network
services (e.g., DNS and BGP), and the
presence of unauthorized or rogue
networks within facilities.
DE.CM-02 The physical environment is
monitored to find potentially
adverse events
High R1: Monitoring the physical environment
should include all successful and failed
access attempts into all controlled areas,
the movement of people and equipment
into and out of secure areas of facilities,
and signs of tampering with physical access
controls.
DE.CM-03 Personnel activity and
technology usage are monitored
to find potentially adverse
events
High R1: Monitoring personnel activity and
technology usage should include
anomalous user activity or unusual
patterns of activity, authentication and
logical access attempts, and the use of
deception technology.
DE.CM-06 External service provider
activities and services are
monitored to find potentially
adverse events
High R1: Monitoring external service provider
activities and services should include
remote and on-site administration and
maintenance activities that providers
perform on organizational systems and
deviations from expected behavior by
cloud-based services, internet service
providers, and other service providers.
DE.CM-09 Computing hardware and
software, runtime environments,
and their data are monitored to
find potentially adverse events
High R1: Monitor email, web, file sharing,
collaboration services, and other common
attack vectors to detect malware, phishing,
data leaks, exfiltration, and other adverse
events.
R2: Monitor authentication attempts to
identify attacks against credentials and
unauthorized credential use.
R3: Monitor software and hardware
configurations for deviations from security
baselines.
R4: Monitor hardware and software,
including cybersecurity protection
mechanisms, for signs of tampering, failure,
or compromise.
R5: Monitor endpoints for cyber health
issues (e.g., missing patches, malware
infections, or unauthorized software), and
redirect endpoints with issues to a
remediation environment before access is
authorized.
DE.AE (Adverse
Event Analysis)
Anomalies, indicators of
compromise, and other
potentially adverse events are
analyzed to characterize the
events and detect cybersecurity
incidents
High N1: Adverse event analysis involves
studying the data on potentially adverse
events collected by continuous monitoring
to find possible attacks and compromises
and declaring when an incident has
occurred so as to initiate incident response
activities.
R1: The volume of potentially adverse
events to be analyzed is generally quite
high, so organizations should rely on
technical solutions that filter large event
datasets down to a subset that is suitable
for human viewing and analysis.
N2: The fidelity of events varies based on
many factors. Anomalies may have benign
or malicious foundations. Some incidents
are relatively easy to find amid the noise,
while others require deep, specialized
technical knowledge and experience.
N3: CTI can be invaluable in detecting
malicious activity early, reducing its impact,
and shortening recovery time. Signs of an
incident may be more obvious later in the
attack life cycle, but the incident’s impact
and scope may be much larger.
R2: Organizations should strive to find
incidents earlier in the attack life cycle and
take a proactive approach to incident
detection and response.
DE.AE-02 Potentially adverse events are
analyzed to better understand
associated activities
High R1: Use tools (e.g., security information
and event management [SIEM]; security
orchestration, automation, and response
[SOAR]) to continuously monitor log events
for known malicious and suspicious activity
and to generate reports on their findings.
R2: Utilize up-to-date CTI in log analysis
tools to improve detection accuracy and
characterize threat actors, their methods,
and indicators of compromise.
R3: Regularly conduct manual reviews of
log events for technologies that cannot be
sufficiently monitored through automation.
DE.AE-03 Information is correlated from
multiple sources
High R1: Constantly transfer the log data
generated by other sources to a relatively
small number of log servers.
R2: Use event correlation technology (e.g.,
SIEM, SOAR) to gather pieces of related
data captured by multiple sources.
R3: Utilize CTI to help correlate events
among log sources.
DE.AE-04 The estimated impact and scope
of adverse events are
understood
High R1: Estimate the impact and scope of
adverse events through automated (e.g.,
SIEM, SOAR) and/or manual means, and
review and refine the estimates.
DE.AE-06 Information on adverse events is
provided to authorized staff and
tools
High R1: Generate alerts and provide them to
cybersecurity and incident response tools
and staff (e.g., the SOC and incident
responders).
R2: Make log analysis findings accessible to
incident responders and other authorized
personnel at all times.
R3: Consider automatically creating and
assigning tickets in the organization’s
ticketing system when certain types of
alerts occur.
DE.AE-07 Cyber threat intelligence and
other contextual information are
integrated into the analysis
High R1: Integrate up-to-date CTI and other
contextual information (e.g., asset
inventories) into adverse event analysis to
improve detection accuracy and
characterize threat actors, their methods,
and indicators of compromise.
R2: Rapidly acquire and analyze
vulnerability disclosures for the
organization’s technologies from suppliers,
vendors, and third-party security
advisories.
N1: See [SP800-150] for guidelines on
consuming, using, and storing CTIs, as well
as establishing CTI relationships.
DE.AE-08 Incidents are declared when
adverse events meet the defined
incident criteria
High R1: Apply incident criteria to known and
assumed characteristics of analyzed
activity, and consider known false positives
to determine whether an incident should
be declared.

## 3.2 Incident Response: Respond (RS)

RS (Respond) Actions regarding a detected
cybersecurity incident are taken
High N1: The Respond Function is at the core of
incident response activities.
RS.MA (Incident
Management)
Responses to detected
cybersecurity incidents are
managed
High N1: Incident management involves
overseeing responses to all incidents and
shifting priorities and resources as needed.
Evaluating the overall risk from an incident
and applying the appropriate prioritization
are perhaps the most critical decision
points in the incident response process.
R1: Because of resource limitations,
incidents should not be handled on a firstcome, first-served basis.
R2: Incident triage, prioritization,
escalation, and elevation and decisions
regarding when to initiate recovery
processes should all be based on a set of
risk evaluation factors. This set can range
from simple to incredibly complex,
depending on the needs and maturity of an
organization.
N2: Examples of possible risk evaluation
factors include asset criticality, functional
impact of the incident, data impact of the
incident, stage of observed activity, threat
actor characterization, and recoverability.
R3: The incident response status should be
tracked for each incident along with
pertinent information, such as an incident
summary, indicators of compromise related
to the incident, the status and expected
time frame for each assigned action, and
next steps to be taken.
RS.MA-01 The incident response plan is
executed in coordination with
relevant third parties once an
incident is declared
High R1: Detection technologies should
automatically report incidents that they
have confirmed.
C1: Consider designating an incident lead
for each incident.
R2: If appropriate, contact the
organization’s incident response service
provider to request assistance.
R3: Initiate execution of other
cybersecurity plans as needed (e.g.,
business continuity and disaster recovery
plans) to support incident response.
RS.MA-02 Incident reports are triaged and
validated
High R1: Perform a preliminary review of a new
incident report to verify that a
cybersecurity incident has occurred, then
estimate the severity of the incident and
the level of urgency needed to respond to
it.
R2: Have mechanisms in place for third
parties to report possible incidents that
involve the organization. Reports should be
carefully monitored and taken seriously.
For example, the organization might be
contacted by a party claiming that its
systems are being attacked by a system at
the organization. External users may report
other indicators, such as an unavailable
service. Other incident response teams
may also report incidents to the
organization.
RS.MA-03 Incidents are categorized and
prioritized
High R1: Perform a more detailed review of
incidents to help categorize them by
incident type (e.g., data breach,
ransomware, account takeover, denial of
service).
R2: Prioritize how quickly incident response
should be performed for each incident
based on its scope, likely impact, timecritical nature, and resource availability.
R3: Select incident response strategies for
active incidents by balancing the need to
quickly recover from an incident with the
need to observe the attacker or conduct a
more thorough investigation.
N1: Every response strategy decision has
trade-offs. For example, a strategy that
supports observing the attacker’s behavior
or conducting a more thorough
investigation may be at odds with the need
to quickly return to normal operations.
RS.MA-04 Incidents are escalated or
elevated as needed
High N1: Escalation generally refers to
increasing resources or time frames, while
elevation usually indicates involving a
higher level of management in the
response efforts.
R1: Track and validate the status of all
ongoing incidents so that incidents in need
of more response resources or a change in
response strategy can be identified and the
necessary changes initiated rapidly.
RS.MA-05 The criteria for initiating incident
recovery are applied
High R1: Apply incident recovery criteria to
known and assumed characteristics of the
incident to determine when an incident’s
recovery processes should be initiated.
R2: Take the possible operational
disruption of incident recovery activities
into account to determine when recovery
should be initiated.
RS.AN (Incident
Analysis)
Investigations are conducted to
ensure effective response and
support forensics and recovery
activities
High N1: The Incident Analysis Category focuses
on investigating, determining, and
documenting what has happened during an
incident, as well as how and why it
happened.
RS.AN-03 Analysis is performed to
establish what has taken place
during an incident and the root
cause of the incident
High R1: Determine the sequence of events that
have occurred during the incident and
which assets and resources were involved
in each of those events.
R2: Attempt to determine what
vulnerabilities, threats, and threat actors
were directly or indirectly involved in the
incident.
R3: Analyze the incident to find the
underlying or systemic root causes.
R4: Check any deployed cyber deception
technology for additional information on
attacker behavior.
N1: This information may also be helpful
for identifying weaknesses in cybersecurity
risk management that should be addressed
to prevent similar incidents from occurring
in the future.
RS.AN-06 Actions performed during an
investigation are recorded, and
the records’ integrity and
provenance are preserved
High N1: Facts discovered and actions taken
during incident response tasks can be
recorded by many means, including a paper
logbook, audio/video recordings, or
automatic session monitoring and logging,
as permitted by the organization’s incident
response plan and policy.
R1: Safeguard the confidentiality and
integrity of incident response records, and
ensure that only authorized personnel have
access.
N2: Incident response records can contain
sensitive information, such as data on
exploited vulnerabilities, recent data
breaches, and users who may have
performed inappropriate actions. The
incident lead is often responsible for
ensuring that incident response records are
properly safeguarded.
RS.AN-07 Incident data and metadata are
collected, and their integrity and
provenance are preserved
High N1: Many incident responses involve the
collection of incident data and metadata.
Formal evidence gathering and handling
using chain-of-custody procedures might
not be performed for every incident that
occurs (e.g., most malware incidents will
not result in prosecution). However,
collected incident data is still considered
evidence, which is defined as “grounds for
belief or disbelief; data on which to base
proof or to establish truth or falsehood”
[SP800-160v1].
R1: Collect and retain evidence from an
incident in accordance with the
organization’s evidence preservation
procedures and data retention policies, and
consider factors such as the possibility of
prosecution, and the cost of retaining the
data and the hardware and software
needed to access the data in the future.
RS.AN-08 An incident’s magnitude is
estimated and validated
High N1: Determining the incident’s magnitude
is often one of the most challenging
aspects of incident response.
R1: Look for indicators of compromise,
evidence of persistence, and other signs of
an incident on both the assets known to be
targeted and other potential targets.
Skipping this activity or performing it in a
superficial way may cause underestimation
of the incident’s magnitude, thus allowing
the incident to continue indefinitely on
other targets without the organization’s
knowledge or monitoring.
RS.CO (Incident
Response
Reporting and
Communication)
Response activities are
coordinated with internal and
external stakeholders, as
required by laws, regulations, or
policies
High N1: Incident response reporting and
communication activities tend to fall into
four categories. Incident coordination
involves communicating current and
planned incident response activities for a
particular incident among the internal and
external parties with incident response
roles and responsibilities. Incident
notification involves formally informing
affected customers, employees, partners,
regulators, or others about a data breach
or other incident. Public communication
involves communicating to the public about
the status of a particular incident, such as
responding to media inquiries. Incident
information sharing involves sharing
cybersecurity threat information with
others, usually voluntarily, based on
activity observed within the organization’s
technology assets.
R1: Organizations should have mechanisms
in place in advance to coordinate with
affected parties about incidents when
needed.
RS.CO-02 Internal and external
stakeholders are notified of
incidents
High R1: When an incident is analyzed and
prioritized, the incident response team
should coordinate with the appropriate
individuals inside and outside of the
organization so that all who need to be
involved will play their roles.
R2: Follow established procedures
concerning incident coordination that
include what must be reported to whom
and at what times (e.g., initial notification,
regular status updates).
R3: Perform notifications in compliance
with the current incident notificationrelated laws and regulations that pertain to
the organization’s sectors, geographic
locations, customer locations, and any
other characteristics that apply to the
organization. Incident notification is an
evolving topic, and new laws and
regulations are being established
frequently.
R4: Notify affected third parties of data
breaches and other cybersecurity incidents
in accordance with regulatory, legal, and
contractual requirements.
R5: Notify law enforcement agencies and
regulatory bodies of incidents based on
criteria in the incident response plan and
management approval. Designated
individuals should contact these parties in a
manner consistent with the requirements
of the law and the organization’s policies
and procedures.
RS.CO-03 Information is shared with
designated internal and external
stakeholders
High N1: Voluntary incident information sharing
is often mutually beneficial because the
same threats and attacks simultaneously
affect multiple organizations. An example is
sharing information about observed TTPs
with a sector-specific Information Sharing
and Analysis Center (ISAC).
N2: Sharing defensive tactics between
organizations can enhance overall
situational awareness and increase the
resiliency of all. There is a cost to threat
actors to develop or purchase exploits and
to deploy them. The effective identification
and dissemination of detection techniques
lowers the attackers’ return on investment
and increases their costs.
N3: Incident handlers might coordinate
their efforts with colleagues at partner
organizations to share tactical, technical
information on mitigating an attack that
spans those organizations. The
organizations participating in this type of
relationship are usually peers without
authority over each other. In addition to
choosing to share information, they may
also pool resources to solve common
problems.
R1: Securely share information with
stakeholders consistent with the
organization’s response plans and
information sharing agreements, including
contracts with suppliers.
R2: Regularly update senior leadership on
the status of major incidents.
R3: Notify human resources when
malicious insider activity has occurred.
R4: Establish and follow media
communications procedures for incident
response that comply with the
organization’s policies on media interaction
and information disclosure.
RS.MI (Incident
Mitigation)
Activities are performed to
prevent expansion of an event
and mitigate its effects
High N1: Manually selecting containment and
eradication actions may be easier and
faster if the organization has criteria and
procedures in place. Criteria could take the
incident type into account (e.g., a cloudbased services compromise or a user
endpoint ransomware infection) and use
some of the risk evaluation factors in
RS.MA. Another factor to consider is the
duration of the containment measure (e.g.,
an emergency workaround that must be
removed within hours, a temporary
workaround to be removed within two
weeks, or a permanent solution). The
eradication measure’s duration could be
similarly evaluated.
R1: In some instances, organizations
redirect an attacker to a sandbox so that
they can monitor the attacker’s activity,
usually to gather additional evidence. This
delays containment and eradication
activities. The incident response team
should first discuss the feasibility of this
strategy with the legal department before
executing it. The intentional delay can be
dangerous because an attacker could
escalate unauthorized access or
compromise other systems.
RS.MI-01 Incidents are contained High N1: Containment refers to preventing the
expansion of an incident. Containment can
prevent additional damage and avoid
overwhelming the organization’s resources.
Most incidents require some form of
containment.
C1: Consider configuring cybersecurity
technologies (e.g., antivirus software) and
the cybersecurity features of other
technologies (e.g., operating systems,
network infrastructure devices) to
automatically perform some containment
actions, like quarantining malware,
transferring a compromised endpoint to an
isolated remediation network, or halting
the execution of an infected container.
C2: Consider authorizing third parties (e.g.,
the organization’s internet service
providers and cloud service providers) to
automatically act to contain certain types
of incidents (e.g., large-scale DDoS attacks)
on behalf of the organization.
R1: Allow incident handlers to manually
select and perform containment actions
instead of or in addition to automated
containment measures.
RS.MI-02 Incidents are eradicated High N1: Eradication refers to mitigating an
incident’s effects. After containment,
eradication may be necessary to eliminate
persistence mechanisms and entry points,
such as deleting malware, disabling
breached user accounts, and identifying
and mitigating all exploited vulnerabilities.
R1: Identify all affected hosts and services
within the organization so that all flaws and
weaknesses can be remediated.
C1: Consider configuring cybersecurity
technologies and the cybersecurity
features of other technologies (e.g.,
operating systems, network infrastructure
devices) to automatically perform some
eradication actions.
C2: Consider authorizing third parties (e.g.,
the organization’s internet service
providers and cloud service providers) to
automatically act to eradicate certain types
of incidents on behalf of the organization.
R2: Allow incident handlers to manually
select and perform eradication actions
instead of or in addition to automated
eradication measures.

## 3.2 Incident Response: Recover (RC)

RC (Recover) Assets and operations affected
by a cybersecurity incident are
restored
High N1: During incident recovery, personnel
restore systems to normal operations,
confirm that the systems are functioning
normally, and (if applicable) remediate
vulnerabilities to prevent similar incidents.
N2: Recovery operations include restoring
systems from clean backups, rebuilding
systems, replacing compromised files with
clean versions, installing patches, changing
passwords, and tightening security
controls. In intrusions where the threat
actor is highly sophisticated and the full
scope of their tactics is not revealed, it may
be necessary to go as far as replacing the
hardware (e.g., bare metal) of all of the
compromised systems.
N3: For more information on incident
recovery, see [SP800-184].
RC.RP (Incident
Recovery Plan
Execution)
Restoration activities are
performed to ensure operational
availability of systems and
services affected by
cybersecurity incidents
High N1: Executing the incident recovery plan
involves selecting, prioritizing, and
performing recovery actions in a secure
manner; verifying the integrity of
recovered assets; declaring the end of
incident recovery; and completing incident
documentation.
N2: For more information on incident
recovery plans and plan execution, see
[SP800-184].
RC.RP-01 The recovery portion of the
incident response plan is
executed once initiated from the
incident response process
High R1: Begin recovery procedures during or
after incident response processes.
R2: Inform all individuals with recovery
responsibilities about the plans for
recovery and the authorizations required to
implement each aspect of the plans.
RC.RP-02 Recovery actions are selected,
scoped, prioritized, and
performed
High R1: Recovery actions should take
timeliness, precision, and reliability (e.g.,
restoring only the affected files versus
restoring all files) into account.
R2: Select recovery actions based on the
criteria defined in the incident response
plan and available resources.
R3: Change planned recovery actions based
on a reassessment of organizational needs
and resources.
RC.RP-03 The integrity of backups and
other restoration assets is
verified before using them for
restoration
High R1: Check restoration assets for indicators
of compromise, file corruption, and other
integrity issues before use.
RC.RP-04 Critical mission functions and
cybersecurity risk management
are considered to establish postincident operational norms
High R1: Validate that essential services are
restored in the appropriate order.
R2: Work with system owners to confirm
the successful restoration of systems and
the return to normal operations.
R3: Monitor the performance of restored
systems to verify the adequacy of the
restoration.
RC.RP-05 The integrity of restored assets
is verified, systems and services
are restored, and normal
operating status is confirmed
High R1: Check restored assets for indicators of
compromise, and remediate the root
causes of the incident before production
use.
R2: Verify the correctness and adequacy of
the restoration actions taken before
putting a restored system online.
RC.RP-06 The end of incident recovery is
declared based on criteria, and
incident-related documentation
is completed
High R1: Prepare an after-action report that
documents the incident itself, the response
and recovery actions taken, and lessons
learned.
RC.CO (Incident
Recovery
Communication)
Restoration activities are
coordinated with internal and
external parties
High N1: Incident recovery communication is a
continuation of the communication
activities in RS.CO.
RC.CO-03 Recovery activities and progress
in restoring operational
capabilities are communicated
to designated internal and
external stakeholders
High R1: Securely share recovery information,
including restoration progress, consistent
with response plans and information
sharing agreements.
R2: Regularly update senior leadership on
recovery status and restoration progress
for major incidents.
R3: Follow the rules and protocols defined
in contracts for incident information
sharing between the organization and its
suppliers.
R4: Coordinate crisis communication
between the organization and its critical
suppliers.
RC.CO-04 Public updates on incident
recovery are shared using
approved methods and
messaging
High R1: Follow the organization’s breach
notification procedures for recovering from
a data breach incident.
R2: Explain the steps being taken to
recover from the incident and to prevent a
recurrence.
