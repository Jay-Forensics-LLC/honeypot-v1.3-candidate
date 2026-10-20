# Security Policy

This policy applies to this repository and its maintained components. Project scope may include cybersecurity monitoring, honeypots, logging, forensic artifact collection, evidence verification, and related services.

Security work must protect confidentiality, integrity, and availability while minimizing unnecessary disruption to development, production services, and evidence collection. Unaffected work should continue during investigation and remediation whenever it can do so safely.

## Supported Versions

Security maintenance focuses on the latest maintained release and active default branch. Experimental, alpha, and beta versions may receive security fixes but should not be assumed ready for production use.

| Version | Supported |
| ------- | --------- |
| Latest release, unless marked unsupported | :white_check_mark: |
| Active default branch | :white_check_mark: |
| Older releases, unless explicitly designated for continued support | :x: |
| Archived or discontinued versions | :x: |
| Third-party forks or independently modified deployments | :x: |

Before a stable release exists, fixes are delivered through the active default branch or a subsequent prerelease.

Users should plan security updates according to severity, exposure, and available mitigations. Urgent vulnerabilities may require action outside normal maintenance windows.

Third-party dependencies and services follow their respective maintainers’ security policies. Vulnerabilities in this project’s integration of those components remain within scope.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately using this repository’s **Security → Report a vulnerability** option, when available.

Do not disclose exploit details, credentials, personal information, raw forensic evidence, or sensitive logs in public issues, discussions, or pull requests. If private reporting is unavailable, open a minimal issue requesting a private reporting channel without including vulnerability details.

### What to Report

Relevant issues include:

- Unauthorized access, authentication bypass, or privilege escalation.
- Command injection, remote code execution, or unsafe processing of untrusted inputs.
- Honeypot containment failures or unintended access to host systems and management networks.
- Exposure of credentials, personal information, private conversations, logs, or collected artifacts.
- Unauthorized modification, deletion, fabrication, replay, or suppression of logs and evidence.
- Flaws in hashing, signature verification, timestamps, provenance tracking, or integrity checks that could produce misleading verification results.
- Unsafe defaults, excessive permissions, exploitable dependencies, or resource-exhaustion weaknesses with a credible project impact.

A matching hash establishes consistency with a reference value; it does not independently establish an artifact’s authenticity, origin, or completeness. Reports showing that the software incorrectly claims stronger assurances are welcome.

### What to Include

Please provide:

- The affected version, commit, component, and deployment context.
- A description of the issue, prerequisites, and likely security impact.
- Minimal reproduction steps or a safe proof of concept.
- Expected behavior and observed behavior.
- Sanitized supporting logs or artifacts, if needed.
- Whether the issue was observed in an isolated environment or an authorized production assessment.

Preserve original evidence separately. Submit only the minimum necessary information and redact secrets and identifying information from submitted copies.

### Responsible Testing

Test only systems you own or have explicit authorization to assess. Use isolated environments, synthetic data, and test credentials wherever possible.

Do not disrupt public services, access other users’ information, deploy malware on live systems, or alter or destroy operational evidence. Stop testing if unexpected sensitive information or service degradation is encountered, and report the issue privately.

Production testing requires authorization covering the target, method, scope, and acceptable operational impact. Permission to review source code does not authorize probing a live deployment.

This policy does not authorize testing of third-party infrastructure or services.

### Production Continuity and Safe Remediation

Maintainers, contributors, and automated coding or security tools must follow these principles:

- **Investigate with minimal impact.** Begin with source review, existing evidence, and authorized, bounded diagnostic reads. Avoid broad scans or repeated reproduction attempts against production.
- **Prepare fixes in isolation.** Use a separate branch or worktree and an isolated test environment. Preserve unrelated work and avoid copying production secrets or sensitive evidence into development environments.
- **Respect existing authorization.** Work within the scope already authorized by the system owner. This policy alone does not authorize deployments, service restarts, daemon reloads, credential changes, or changes to DNS, firewalls, authentication, storage, or collection pipelines.
- **Keep unaffected work moving.** A report does not automatically require a project-wide development freeze or shutdown. Assess affected components and shared dependencies, and apply holds where continued operation or release would create an unacceptable security risk.
- **Validate relevant behavior.** Check the security fix and affected functionality, including containment, logging, evidence integrity, and availability where applicable. Do not bypass existing security controls or required checks to preserve a schedule.
- **Deploy according to risk.** Use normal reviewed releases and maintenance windows when the assessed risk permits. For production changes, identify the expected impact, verification steps, and a safe recovery or rollback path.
- **Verify after deployment.** Confirm that the vulnerability is addressed and that affected services, security controls, and evidence collection function correctly. A rollback must not silently reintroduce an exposed vulnerability; use compensating controls or keep the affected capability restricted.

If a fix is deferred, record the reason, responsible owner, interim mitigation, and reassessment date. Convenience alone is not sufficient grounds to leave a serious exposure unresolved.

### Emergency Containment

Credible evidence of active exploitation, exposed credentials, containment failure, unauthorized data access, or evidence tampering requires prompt assessment and proportionate containment.

Authorized responders may act within existing incident-response authority or a preapproved runbook. Actions outside that authority require the system owner’s authorization.

Prefer the smallest effective intervention, such as isolating an affected service, revoking a compromised credential, or restricting a vulnerable endpoint. A temporary interruption may be necessary when continued operation would increase harm.

Preserve relevant evidence where feasible, but do not delay necessary containment solely to complete evidence collection. Record actions, timestamps, affected components, and any collection gaps or changes in evidence reliability.

### Response and Resolution

We aim to acknowledge reports within **7 calendar days** and provide a status update at least every **30 calendar days** while a confirmed issue remains open. These are best-effort communication targets, not waiting periods for urgent containment.

Reports are prioritized by likely impact, exposure, exploitability, and evidence of active exploitation.

If accepted, a report will be assessed for affected versions and practical impact. Remediation may include a patch, configuration guidance, a temporary restriction, a workaround, or a security advisory.

If declined, we will explain the reason where practical, such as insufficient reproduction details, duplicate reporting, or an issue outside the project’s scope.

Please coordinate public disclosure with maintainers so users have a reasonable opportunity to apply fixes. Reporter credit will be offered with consent. No monetary bounty is promised.
