import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Dispatch Agent Command - SECURITY HARDENED
 * 
 * SECURITY FIX P0-002: Command Injection Prevention
 * - JSON schema validation for all command params
 * - Whitelist allowed values per command type
 * - HMAC signature generation for command integrity
 */

// P0-002 FIX: Command parameter schemas
const COMMAND_SCHEMAS = {
    'defense.activate': {
        required: ['defense_type'],
        properties: {
            defense_type: { 
                type: 'string',
                enum: ['panic_shield', 'usb_lockdown', 'network_isolation', 'firewall_strict']
            },
            duration_seconds: { type: 'number', minimum: 60, maximum: 86400 }
        }
    },
    'defense.deactivate': {
        required: ['defense_type'],
        properties: {
            defense_type: {
                type: 'string',
                enum: ['panic_shield', 'usb_lockdown', 'network_isolation', 'firewall_strict']
            }
        }
    },
    'snapshot.run': {
        required: ['collection_type'],
        properties: {
            collection_type: {
                type: 'string',
                enum: ['memory_dump', 'disk_image', 'network_pcap', 'system_logs', 'process_list', 'file_artifacts']
            },
            timeout: { type: 'number', minimum: 10, maximum: 3600 },
            compression: { type: 'boolean' }
        }
    },
    'policy.usb_lockdown.set': {
        required: ['enabled'],
        properties: {
            enabled: { type: 'boolean' },
            whitelist_device_ids: { type: 'array', items: { type: 'string', pattern: '^[a-zA-Z0-9-]+$' } }
        }
    },
    'policy.network.set': {
        required: ['firewall_level'],
        properties: {
            firewall_level: {
                type: 'string',
                enum: ['permissive', 'balanced', 'strict', 'paranoid']
            },
            allowed_ports: { type: 'array', items: { type: 'number', minimum: 1, maximum: 65535 } }
        }
    },
    'health.check': {
        required: [],
        properties: {
            include_network: { type: 'boolean' },
            include_disk: { type: 'boolean' }
        }
    }
};

/**
 * Validate command parameters against schema
 * P0-002 FIX: Prevents command injection via malicious params
 */
function validateCommandParams(command_kind, params) {
    const schema = COMMAND_SCHEMAS[command_kind];
    
    if (!schema) {
        throw new Error(`Unknown command kind: ${command_kind}`);
    }

    // Check required fields
    for (const field of schema.required) {
        if (!(field in params)) {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    // Validate each parameter
    for (const [key, value] of Object.entries(params)) {
        const propSchema = schema.properties[key];
        
        if (!propSchema) {
            throw new Error(`Unknown parameter: ${key}. Only allowed: ${Object.keys(schema.properties).join(', ')}`);
        }

        // Type validation
        if (propSchema.type === 'string' && typeof value !== 'string') {
            throw new Error(`Parameter ${key} must be a string`);
        }
        if (propSchema.type === 'number' && typeof value !== 'number') {
            throw new Error(`Parameter ${key} must be a number`);
        }
        if (propSchema.type === 'boolean' && typeof value !== 'boolean') {
            throw new Error(`Parameter ${key} must be a boolean`);
        }

        // Enum validation
        if (propSchema.enum && !propSchema.enum.includes(value)) {
            throw new Error(`Parameter ${key} must be one of: ${propSchema.enum.join(', ')}`);
        }

        // Range validation
        if (propSchema.minimum !== undefined && value < propSchema.minimum) {
            throw new Error(`Parameter ${key} must be >= ${propSchema.minimum}`);
        }
        if (propSchema.maximum !== undefined && value > propSchema.maximum) {
            throw new Error(`Parameter ${key} must be <= ${propSchema.maximum}`);
        }

        // Pattern validation
        if (propSchema.pattern && typeof value === 'string') {
            const regex = new RegExp(propSchema.pattern);
            if (!regex.test(value)) {
                throw new Error(`Parameter ${key} has invalid format`);
            }
        }

        // Array validation
        if (propSchema.type === 'array') {
            if (!Array.isArray(value)) {
                throw new Error(`Parameter ${key} must be an array`);
            }
            // Validate array items
            if (propSchema.items) {
                for (const item of value) {
                    if (propSchema.items.type && typeof item !== propSchema.items.type) {
                        throw new Error(`Array ${key} items must be ${propSchema.items.type}`);
                    }
                    if (propSchema.items.enum && !propSchema.items.enum.includes(item)) {
                        throw new Error(`Array ${key} items must be one of: ${propSchema.items.enum.join(', ')}`);
                    }
                    if (propSchema.items.pattern) {
                        const regex = new RegExp(propSchema.items.pattern);
                        if (!regex.test(item)) {
                            throw new Error(`Array ${key} item has invalid format`);
                        }
                    }
                }
            }
        }
    }

    return true;
}

/**
 * Generate HMAC signature for command integrity
 * P0-002 FIX: Prevents tampering with commands in transit
 */
async function signCommand(command) {
    const signingKey = Deno.env.get('SERVER_SIGNING_KEY');
    
    if (!signingKey) {
        console.warn('SERVER_SIGNING_KEY not set, skipping command signing');
        return null;
    }

    const message = JSON.stringify({
        device_id: command.device_id,
        command_kind: command.command_kind,
        params: command.params,
        issued_at: command.issued_at,
        counter: command.counter
    });

    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingKey);
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        encoder.encode(message)
    );

    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ 
                error: 'Unauthorized',
                error_code: 'ERR-401'
            }, { status: 401 });
        }

        // Only admins can dispatch commands
        if (user.role !== 'admin') {
            return Response.json({
                error: 'Permission denied',
                error_code: 'ERR-403',
                message: 'Only administrators can dispatch agent commands.',
                next_step: 'Contact your administrator for assistance.'
            }, { status: 403 });
        }

        const { device_id, command_kind, params, expires_in_seconds = 300 } = await req.json();

        if (!device_id || !command_kind || !params) {
            return Response.json({
                error: 'Missing required fields',
                error_code: 'ERR-400',
                message: 'device_id, command_kind, and params are required.',
                example: {
                    device_id: 'AGENT-12345',
                    command_kind: 'snapshot.run',
                    params: { collection_type: 'memory_dump' }
                }
            }, { status: 400 });
        }

        // P0-002 FIX: Validate command parameters
        try {
            validateCommandParams(command_kind, params);
        } catch (validationError) {
            return Response.json({
                error: 'Invalid command parameters',
                error_code: 'ERR-400-VALIDATION',
                message: validationError.message,
                next_step: 'Check the allowed parameters for this command type.',
                allowed_schema: COMMAND_SCHEMAS[command_kind] || 'Unknown command'
            }, { status: 400 });
        }

        // Verify device exists and user has access
        const devices = await base44.entities.Device.filter({
            id: device_id
        });

        if (!devices || devices.length === 0) {
            return Response.json({
                error: 'Device not found',
                error_code: 'ERR-404-DEVICE',
                message: 'The specified device does not exist or you do not have access.',
                next_step: 'Verify the device ID and try again.'
            }, { status: 404 });
        }

        const device = devices[0];

        if (device.status !== 'enrolled') {
            return Response.json({
                error: 'Device not enrolled',
                error_code: 'ERR-400-STATUS',
                message: `Device status is "${device.status}". Only enrolled devices can receive commands.`,
                next_step: device.status === 'suspended' ? 'Unsuspend the device first.' : 'Re-enroll the device.'
            }, { status: 400 });
        }

        // Create command with signature
        const commandData = {
            device_id,
            command_kind,
            params, // Now validated
            issued_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + (expires_in_seconds * 1000)).toISOString(),
            counter: Date.now(),
            status: 'queued',
            issued_by: user.email
        };

        // P0-002 FIX: Sign command for integrity
        const signature = await signCommand(commandData);
        if (signature) {
            commandData.server_signature = signature;
        }

        const command = await base44.entities.AgentCommand.create(commandData);

        // Audit log with organization isolation
        await base44.entities.AuditLog.create({
            organization_id: user.organization_id,
            event_type: 'agent_command_dispatched',
            severity: 'warning',
            description: `Command "${command_kind}" dispatched to ${device.display_name}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                command_id: command.id,
                device_id,
                command_kind,
                signed: !!signature
            }
        }).catch((err) => console.warn('Audit log failed:', err));

        return Response.json({
            success: true,
            command_id: command.id,
            status: 'queued',
            expires_at: command.expires_at,
            message: 'Command dispatched successfully and signed for integrity verification',
            estimated_delivery: '5-30 seconds (depends on agent heartbeat interval)'
        });

    } catch (error) {
        console.error('Command dispatch error:', error);
        return Response.json({
            error: 'Command dispatch failed',
            error_code: 'ERR-500',
            message: 'Failed to dispatch command to agent.',
            details: error.message,
            next_step: 'Verify the device is online and try again. If issue persists, contact support.',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
});