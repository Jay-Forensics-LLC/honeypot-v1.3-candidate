openapi: 3.1.0
info:
  title: Sentinel Forensics AI Analytics API
  version: 1.0.0
  description: |
    AI-driven analytics endpoints for network anomaly detection, memory dump analysis,
    and user behavior analytics with full evidence traceability.
  contact:
    name: Sentinel Forensics Team

servers:
  - url: https://app.base44.com/api
    description: Production API

security:
  - BearerAuth: []

paths:
  /functions/runAIAnalytics:
    post:
      summary: Run AI analytics on case data
      operationId: runAIAnalytics
      tags:
        - Analytics
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateAnalyticsRunRequest'
            examples:
              networkAnomaly:
                value:
                  caseId: "case_abc123"
                  runType: "network_anomaly"
                  courtAdmissibleMode: true
              combined:
                value:
                  caseId: "case_abc123"
                  runType: "combined"
                  artifactIds: ["artifact_xyz789"]
                  timeRange:
                    start: "2026-01-01T00:00:00Z"
                    end: "2026-01-03T23:59:59Z"
      responses:
        '200':
          description: Analytics run completed successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateAnalyticsRunResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '500':
          $ref: '#/components/responses/InternalError'

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    CreateAnalyticsRunRequest:
      type: object
      required:
        - caseId
        - runType
      properties:
        caseId:
          type: string
          format: uuid
          description: Case identifier
        runType:
          type: string
          enum:
            - network_anomaly
            - memory_anomaly
            - behavior_analytics
            - combined
          description: Type of analytics to run
        artifactIds:
          type: array
          items:
            type: string
            format: uuid
          description: Specific artifacts to analyze (optional, analyzes all if omitted)
        timeRange:
          $ref: '#/components/schemas/TimeRange'
        courtAdmissibleMode:
          type: boolean
          default: false
          description: Use higher confidence thresholds for court presentation

    CreateAnalyticsRunResponse:
      type: object
      required:
        - success
        - run_id
      properties:
        success:
          type: boolean
        run_id:
          type: string
          format: uuid
        findings_count:
          type: integer
          minimum: 0
        visualizations_count:
          type: integer
          minimum: 0

    TimeRange:
      type: object
      required:
        - start
        - end
      properties:
        start:
          type: string
          format: date-time
          description: Start timestamp (ISO 8601)
        end:
          type: string
          format: date-time
          description: End timestamp (ISO 8601)

    EvidenceArtifact:
      type: object
      required:
        - id
        - case_id
        - organization_id
        - artifact_type
        - sha256_hash
      properties:
        id:
          type: string
          format: uuid
        case_id:
          type: string
          format: uuid
        organization_id:
          type: string
          format: uuid
        artifact_type:
          type: string
          enum:
            - pcap_metadata
            - netflow
            - dns_log
            - tls_log
            - memory_dump
            - memory_extraction
            - system_log
            - edr_log
            - browser_log
            - custom
        file_url:
          type: string
          format: uri
        file_name:
          type: string
        sha256_hash:
          type: string
          pattern: '^[A-Fa-f0-9]{64}$'
        size_bytes:
          type: integer
          minimum: 0
        source_device_id:
          type: string
          format: uuid
        ingested_at:
          type: string
          format: date-time
        labels:
          type: array
          items:
            type: string
          uniqueItems: true
        notes:
          type: string
          maxLength: 20000
        created_date:
          type: string
          format: date-time
        updated_date:
          type: string
          format: date-time
        created_by:
          type: string
          format: email

    NormalizedEvent:
      type: object
      required:
        - id
        - case_id
        - artifact_id
        - event_type
        - event_time
        - attributes_json
      properties:
        id:
          type: string
          format: uuid
        case_id:
          type: string
          format: uuid
        organization_id:
          type: string
          format: uuid
        artifact_id:
          type: string
          format: uuid
        event_type:
          type: string
          enum:
            - net_flow
            - dns_query
            - tls_handshake
            - http_meta
            - process_start
            - process_end
            - file_access
            - auth
            - usb
            - scheduled_task
            - powershell
            - registry
            - memory_proc
            - memory_module
            - memory_region
            - memory_string
        event_time:
          type: string
          format: date-time
        host_id:
          type: string
        actor_user:
          type: string
        src_ip:
          type: string
          format: ipv4
        src_port:
          type: integer
          minimum: 0
          maximum: 65535
        dst_ip:
          type: string
          format: ipv4
        dst_port:
          type: integer
          minimum: 0
          maximum: 65535
        domain:
          type: string
        sni:
          type: string
        ja3:
          type: string
        ja4:
          type: string
        process_id:
          type: integer
        parent_process_id:
          type: integer
        process_name:
          type: string
        command_line:
          type: string
        file_path:
          type: string
        registry_path:
          type: string
        attributes_json:
          type: object
          additionalProperties: true
        quality_score:
          type: number
          minimum: 0
          maximum: 1
          default: 1.0

    AnalyticsRun:
      type: object
      required:
        - id
        - case_id
        - run_type
        - status
      properties:
        id:
          type: string
          format: uuid
        case_id:
          type: string
          format: uuid
        organization_id:
          type: string
          format: uuid
        run_type:
          type: string
          enum:
            - network_anomaly
            - memory_anomaly
            - behavior_analytics
            - combined
        status:
          type: string
          enum:
            - queued
            - running
            - success
            - failed
        started_at:
          type: string
          format: date-time
        finished_at:
          type: string
          format: date-time
        model_provider:
          type: string
        model_name:
          type: string
        model_version:
          type: string
        prompt_version:
          type: string
        parameters_json:
          type: object
          additionalProperties: true
        input_artifact_ids:
          type: array
          items:
            type: string
            format: uuid
        input_event_query:
          type: string
        output_summary:
          type: string
          maxLength: 20000
        court_admissible_mode:
          type: boolean
          default: false
        run_fingerprint:
          type: string
          pattern: '^[A-Fa-f0-9]{16}$'

    EvidenceRef:
      type: object
      required:
        - artifact_id
      properties:
        artifact_id:
          type: string
          format: uuid
        event_ids:
          type: array
          items:
            type: string
            format: uuid
          uniqueItems: true
        fields_used:
          type: array
          items:
            type: string
        time_range:
          $ref: '#/components/schemas/TimeRange'

    ReproducibilityBlock:
      type: object
      properties:
        model:
          type: string
        prompt_version:
          type: string
        detection_confidence:
          type: number
          minimum: 0
          maximum: 1
        anomaly_types:
          type: array
          items:
            type: string

    AIAnalyticsFinding:
      type: object
      required:
        - id
        - case_id
        - analytics_run_id
        - finding_type
        - title
        - severity
        - confidence
      properties:
        id:
          type: string
          format: uuid
        case_id:
          type: string
          format: uuid
        organization_id:
          type: string
          format: uuid
        analytics_run_id:
          type: string
          format: uuid
        finding_type:
          type: string
          enum:
            - anomaly
            - cluster
            - behavior_deviation
            - indicator
            - correlation
            - outlier
        title:
          type: string
          maxLength: 240
        description:
          type: string
          maxLength: 20000
        severity:
          type: string
          enum:
            - info
            - low
            - medium
            - high
            - critical
        confidence:
          type: number
          minimum: 0
          maximum: 1
          description: Confidence score (0-1)
        confidence_explain:
          type: string
          maxLength: 8000
        rationale:
          type: string
          maxLength: 20000
        recommended_actions:
          type: array
          items:
            type: string
        evidence_refs:
          type: array
          items:
            $ref: '#/components/schemas/EvidenceRef'
        reproducibility:
          $ref: '#/components/schemas/ReproducibilityBlock'
        analyst_notes:
          type: string
          maxLength: 20000
        reviewed:
          type: boolean
          default: false

    VisualizationArtifact:
      type: object
      required:
        - id
        - case_id
        - analytics_run_id
        - viz_type
        - title
        - spec_json
      properties:
        id:
          type: string
          format: uuid
        case_id:
          type: string
          format: uuid
        organization_id:
          type: string
          format: uuid
        analytics_run_id:
          type: string
          format: uuid
        viz_type:
          type: string
          enum:
            - network_graph
            - process_tree
            - timeline
            - heatmap
        title:
          type: string
        spec_json:
          type: object
          description: Visualization specification (type depends on viz_type)
        preview_url:
          type: string
          format: uri

    ProblemDetails:
      type: object
      required:
        - type
        - title
        - status
      properties:
        type:
          type: string
          format: uri
          description: Problem type URI
        title:
          type: string
          description: Short error summary
        status:
          type: integer
          description: HTTP status code
        detail:
          type: string
          description: Detailed error message
        instance:
          type: string
          format: uri
          description: Request instance identifier
        errors:
          type: array
          items:
            type: object
            properties:
              field:
                type: string
              message:
                type: string

  responses:
    BadRequest:
      description: Invalid request parameters or payload
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: "about:blank"
            title: "Bad Request"
            status: 400
            detail: "Missing required field: caseId"

    Unauthorized:
      description: Authentication required or invalid credentials
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: "about:blank"
            title: "Unauthorized"
            status: 401
            detail: "Valid authentication token required"

    InternalError:
      description: Internal server error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: "about:blank"
            title: "Internal Server Error"
            status: 500
            detail: "An unexpected error occurred during processing"

tags:
  - name: Analytics
    description: AI-driven analytics operations
  - name: Findings
    description: Analytics findings management
  - name: Visualizations
    description: Auto-generated visualizations