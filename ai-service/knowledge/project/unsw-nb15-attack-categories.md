---
title: Study notes on the UNSW-NB15 attack categories
publisher: Project team (own notes)
url: local
reference: project notes, not an official source
---
# About these notes

These are short study notes written by the project team to help explain the category names that the
category model can output. They are general descriptions, not quotes from the dataset authors, and
they are not an authoritative source. Check the dataset documentation for exact definitions.

## How categories are used in this project

The binary model decides whether a network flow looks normal or like an attack. A second model then
suggests which attack category the flow resembles. The suggestion is a best guess and can be wrong.
An alert's category is a hint for where to start looking, not a finding.

## Fuzzers

Fuzzing means sending large amounts of unexpected or malformed input to a service to see whether it
crashes or misbehaves. In network flows this can look like many short, unusual connections to the same service.

## Reconnaissance

Reconnaissance is information gathering before an attack, such as scanning many ports or many hosts to find
what is reachable. In flows it often appears as many connections to different ports or addresses with very little data.

## DoS

A denial-of-service attack tries to make a service unavailable by overwhelming it or exhausting its resources.
In flows this can appear as a large number of connections or packets aimed at one target in a short time.

## Exploits

An exploit takes advantage of a specific weakness in software to make it do something unintended.
Exploit traffic can look similar to normal traffic, which is one reason this category is hard to detect.

## Generic

Generic attacks use methods that work against many kinds of systems regardless of how they are built,
for example attacks on cryptographic or hashing weaknesses. Check the dataset notes for how this category is defined.

## Analysis, Backdoor, Shellcode and Worms

Analysis covers probing activity such as port scans and the sending of crafted data to learn about a system.
A backdoor is a hidden way to access a system while avoiding normal authentication.
Shellcode is a small piece of code used as the payload of an exploit to give the attacker control.
A worm is malware that copies itself to other machines over the network.
These categories have far fewer examples than the others, so the model is usually less reliable on them.

## Limits of any flow-based detection

A flow record describes how a connection looked (sizes, durations, counts), not what the data contained.
A flagged flow is a reason to investigate, not proof of an attack, and a flow that is not flagged is not proof that it was safe.
