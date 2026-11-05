{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://sentinel-forensics.com/schemas/evidence-grade-report/2.0.0",
  "title": "Evidence-Grade DFIR Report Schema",
  "description": "Court-defensible forensic report with full provenance and artifact traceability",
  "type": "object",
  "properties": {
    "report_metadata": {
      "type": "object",
      "required": ["report_id", "report_version", "generated_at", "generator", "mode"],
      "properties": {
        "report_id": {
          "type": "string",
          "format": "uuid",
          "description": "Unique report identifier"
        },
        "report_version": {
          "type": "string",
          "pattern": "^\\d+\\.\\d+\\.\\d+$",
          "description": "Semantic version (e.g., 1.0.0)"
        },
        "generated_at": {
          "type": "string",
          "format": "date-time",
          "description": "RFC3339 timestamp with timezone (e.g., 2026-01-05T10:23:45.123-05:00)"
        },
        "generator": {
          "type": "object",
          "required": ["app_version", "environment"],
          "properties": {
            "app_version": {"type": "string"},
            "build_id": {"type": "string"},
            "commit_hash": {"type": "string", "pattern": "^[a-f0-9]{40}$"},
            "environment": {"type": "string", "enum": ["prod", "test", "dev", "lab"]}
          }
        },
        "mode": {
          "type": "string",
          "enum": ["live_scan", "offline_analysis", "imported_artifacts", "replay"],
          "description": "Data acquisition mode"
        },
        "is_simulated": {
          "type": "boolean",
          "description": "True if ANY data is synthetic/demo/test"
        },
        "data_classification": {
          "type": "string",
          "enum": ["public", "internal", "confidential", "restricted"]
        },
        "scope_and_consent": {
          "type": "string",
          "description": "Legal authorization and scope limits"
        }
      }
    },
    "target_identity": {
      "type": "object",
      "required": ["device_id"],
      "properties": {
        "device_id": {
          "type": "string",
          "description": "Stable device identifier (UUID or hardware-derived hash)"
        },
        "hostname": {"type": "string"},
        "user_context": {"type": "string"},
        "os_name": {"type": "string"},
        "os_version": {"type": "string"},
        "os_build": {"type": "string"},
        "hardware_id_hash": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$",
          "description": "SHA-256 of concatenated hardware IDs"
        },
        "network_context": {
          "type": "object",
          "properties": {
            "local_subnets": {"type": "array", "items": {"type": "string"}},
            "nat_detected": {"type": "boolean"},
            "public_ip": {"type": "string"}
          }
        }
      }
    },
    "acquisition_provenance": {
      "type": "object",
      "required": ["collection_start", "collection_end"],
      "properties": {
        "agent_id": {"type": "string"},
        "collector_id": {"type": "string"},
        "toolchain": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "version"],
            "properties": {
              "name": {"type": "string"},
              "version": {"type": "string"},
              "config_hash": {"type": "string", "pattern": "^[a-f0-9]{64}$"}
            }
          }
        },
        "collection_start": {"type": "string", "format": "date-time"},
        "collection_end": {"type": "string", "format": "date-time"},
        "time_sync_status": {
          "type": "string",
          "enum": ["ntp_synced", "manual", "unknown", "drifted"],
          "description": "Clock synchronization state"
        },
        "clock_drift_ms": {"type": "number"},
        "operator_id": {"type": "string"},
        "authorization_context": {"type": "string"}
      }
    },
    "evidence_inventory": {
      "type": "array",
      "description": "Evidence ledger - ALL raw artifacts with hashes",
      "items": {
        "type": "object",
        "required": ["evidence_id", "type", "source", "collected_at", "hash_sha256"],
        "properties": {
          "evidence_id": {"type": "string", "format": "uuid"},
          "type": {
            "type": "string",
            "enum": [
              "pcap", "eventlog", "process_snapshot", "file", "vuln_scan_output",
              "socket_table", "registry_hive", "memory_dump", "disk_image", 
              "network_flow", "tls_log", "dns_log", "system_info", "other"
            ]
          },
          "source": {
            "type": "string",
            "description": "Storage path, object key, or DB ID"
          },
          "collected_at": {"type": "string", "format": "date-time"},
          "collector_id": {"type": "string"},
          "method": {
            "type": "string",
            "description": "Collection command or API (e.g., 'tcpdump -i eth0', 'Get-EventLog -LogName Security')"
          },
          "hash_sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
          "hash_sha512": {"type": "string", "pattern": "^[a-f0-9]{128}$"},
          "size_bytes": {"type": "number", "minimum": 0},
          "content_encoding": {"type": "string"},
          "retention_days": {"type": "number"},
          "is_simulated": {"type": "boolean"},
          "chain_of_custody": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["timestamp", "actor", "action"],
              "properties": {
                "timestamp": {"type": "string", "format": "date-time"},
                "actor": {"type": "string"},
                "action": {"type": "string"},
                "signature": {"type": "string"}
              }
            }
          }
        }
      }
    },
    "findings": {
      "type": "array",
      "description": "Evidence-backed findings ONLY",
      "items": {
        "type": "object",
        "required": ["finding_id", "title", "category", "severity", "confidence", "status", "evidence_refs"],
        "properties": {
          "finding_id": {"type": "string", "format": "uuid"},
          "title": {"type": "string", "maxLength": 240},
          "category": {
            "type": "string",
            "enum": ["network", "vulnerability", "malware", "process", "system_integrity", "behavioral", "data_integrity", "compliance", "other"]
          },
          "severity": {
            "type": "string",
            "enum": ["info", "low", "medium", "high", "critical"],
            "description": "Use CVSS or NIST severity rubric"
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confidence level: 0.0 (no confidence) to 1.0 (certain)"
          },
          "confidence_explanation": {
            "type": "string",
            "description": "WHY this confidence level (e.g., 'Reduced to 0.4 due to lack of process attribution')"
          },
          "status": {
            "type": "string",
            "enum": ["open", "confirmed", "false_positive", "needs_more_data", "insufficient_evidence"]
          },
          "observed_facts": {
            "type": "array",
            "description": "FACTS ONLY - no interpretation",
            "items": {
              "type": "object",
              "required": ["fact", "source"],
              "properties": {
                "fact": {"type": "string"},
                "source": {"type": "string", "description": "Evidence ID or log reference"},
                "timestamp": {"type": "string", "format": "date-time"}
              }
            }
          },
          "evidence_refs": {
            "type": "array",
            "description": "MANDATORY: References to raw artifacts",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["evidence_id"],
              "properties": {
                "evidence_id": {"type": "string"},
                "locator": {
                  "type": "string",
                  "description": "Precise locator (e.g., 'pcap:frames_1000-1050', 'eventlog:event_id_4624', 'file:offset_0x1000')"
                },
                "relevance": {"type": "string"}
              }
            }
          },
          "reasoning": {
            "type": "string",
            "description": "Inference logic - HOW facts support conclusion"
          },
          "limitations": {
            "type": "string",
            "description": "WHAT CANNOT BE CONCLUDED - critical for defensibility"
          },
          "recommended_actions": {
            "type": "array",
            "items": {"type": "string"}
          },
          "mitre_attack_mapping": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "technique_id": {"type": "string", "pattern": "^T\\d{4}(\\.\\d{3})?$"},
                "tactic": {"type": "string"}
              }
            }
          }
        }
      }
    },
    "scoring_model": {
      "type": "object",
      "description": "Optional - only if defensible",
      "properties": {
        "overall_score": {"type": "number", "minimum": 0, "maximum": 100},
        "formula": {"type": "string", "description": "Mathematical formula (e.g., 'weighted_sum(category_scores)')"},
        "category_weights": {
          "type": "object",
          "additionalProperties": {"type": "number"}
        },
        "missing_data_handling": {
          "type": "string",
          "description": "How score treats missing data (e.g., 'treat as fail', 'exclude from calculation')"
        },
        "thresholds": {
          "type": "object",
          "properties": {
            "pass": {"type": "number"},
            "warn": {"type": "number"},
            "fail": {"type": "number"}
          }
        }
      }
    },
    "report_integrity": {
      "type": "object",
      "required": ["report_sha256"],
      "properties": {
        "report_sha256": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$",
          "description": "SHA-256 hash of canonical JSON (excluding this field)"
        },
        "evidence_merkle_root": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$",
          "description": "Merkle root of all evidence_inventory hashes"
        },
        "signature": {
          "type": "object",
          "properties": {
            "algorithm": {"type": "string", "enum": ["Ed25519", "ECDSA_P256", "RSA_PSS"]},
            "key_id": {"type": "string"},
            "signature_value": {"type": "string"}
          }
        },
        "verification_instructions": {
          "type": "string",
          "description": "How to verify: hash canonical JSON, compare to report_sha256, verify signature"
        }
      }
    },
    "ui_narrative": {
      "type": "object",
      "description": "User-friendly summaries (MUST reference finding_ids, NO new claims)",
      "properties": {
        "executive_summary": {"type": "string"},
        "detailed_descriptions": {
          "type": "object",
          "additionalProperties": {"type": "string"}
        }
      }
    }
  },
  "required": [
    "report_metadata",
    "target_identity",
    "acquisition_provenance",
    "evidence_inventory",
    "findings",
    "report_integrity"
  ]
}