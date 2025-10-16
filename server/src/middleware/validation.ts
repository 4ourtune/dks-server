import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export const validate = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            schema.parse({
                body: req.body,
                query: req.query,
                params: req.params
            });
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Validation error',
                    details: error.errors.map(err => ({
                        path: err.path.join('.'),
                        message: err.message
                    }))
                });
                return;
            }
            next(error);
        }
    };
};

export const registerSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email format'),
        password: z.string()
            .min(8, 'Password must be at least 8 characters')
            .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
                'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
        name: z.string().min(1, 'Name is required').max(100, 'Name too long')
    })
});

export const loginSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email format'),
        password: z.string().min(1, 'Password is required')
    })
});

export const vehicleSchema = z.object({
    body: z.object({
        vin: z.string().length(17, 'VIN must be exactly 17 characters'),
        model: z.string().min(1, 'Model is required').max(100, 'Model name too long'),
        device_id: z.string().min(1, 'Device ID is required').max(32, 'Device ID too long'),
        status: z.enum(['active', 'inactive', 'maintenance']).optional()
    })
});


export const pinPairingConfirmSchema = z.object({
    body: z.object({
        vehicleId: z.union([
            z.number().positive('Vehicle ID must be positive'),
            z.string().regex(/^\d+$/, 'Vehicle ID must be numeric').transform((value) => Number(value))
        ]),
        pin: z.string().regex(/^[A-Z0-9]{6}$/, 'PIN must be 6 alphanumeric characters')
    })
});

export const pinPairingStatusSchema = z.object({
    query: z.object({
        vehicleId: z.string().regex(/^\d+$/, 'Vehicle ID must be numeric')
    })
});

export const digitalKeySchema = z.object({
    body: z.object({
        vehicle_id: z.number().positive('Invalid vehicle ID'),
        permissions: z.object({
            unlock: z.boolean(),
            start: z.boolean(),
            trunk: z.boolean()
        }),
        expires_at: z.string().datetime().optional()
    })
});

export const vehicleCommandSchema = z.object({
    body: z.object({
        action: z.enum(['unlock', 'lock', 'engine_on']),
        key_id: z.number().positive('Invalid key ID')
    }),
    params: z.object({
        vehicleId: z.string().regex(/^\d+$/, 'Vehicle ID must be a number')
    })
});

export const keyPermissionUpdateSchema = z.object({
    body: z.object({
        permissions: z.object({
            unlock: z.boolean(),
            start: z.boolean(),
            trunk: z.boolean()
        }),
        is_active: z.boolean().optional(),
        expires_at: z.string().datetime().optional()
    }),
    params: z.object({
        keyId: z.string().regex(/^\d+$/, 'Key ID must be a number')
    })
});

export const refreshTokenSchema = z.object({
    body: z.object({
        refreshToken: z.string().min(1, 'Refresh token is required')
    })
});

export const vehicleIdParamSchema = z.object({
    params: z.object({
        vehicleId: z.string().regex(/^\d+$/, 'Vehicle ID must be a number')
    })
});

export const keyIdParamSchema = z.object({
    params: z.object({
        keyId: z.string().regex(/^\d+$/, 'Key ID must be a number')
    })
});

export const paginationSchema = z.object({
    query: z.object({
        page: z.string().regex(/^\d+$/, 'Page must be a number').optional(),
        limit: z.string().regex(/^\d+$/, 'Limit must be a number').optional()
    })
});

export const rateLimit = (windowMs: number, max: number) => {
    const requests = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction) => {
        const clientId = req.ip || 'unknown';
        const now = Date.now();
        
        const clientData = requests.get(clientId);
        
        if (!clientData || now > clientData.resetTime) {
            requests.set(clientId, {
                count: 1,
                resetTime: now + windowMs
            });
            return next();
        }
        
        if (clientData.count >= max) {
            return res.status(429).json({
                error: 'Too many requests',
                retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
            });
        }
        
        clientData.count++;
        next();
    };
};

export const errorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Error:', error);

    if (error.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation error',
            message: error.message
        });
    }

    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Invalid token',
            message: 'Authentication failed'
        });
    }

    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Token expired',
            message: 'Please refresh your token'
        });
    }

    return res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
};

export const certificateValidationSchemas = {
    vehicleCertificateSchema: z.object({
        body: z.object({
            vehicleId: z.number().positive('Invalid vehicle ID'),
            deviceSerial: z.string().min(1, 'Device serial is required').max(32, 'Serial too long'),
            manufacturer: z.string().max(50, 'Manufacturer name too long').optional(),
            model: z.string().max(100, 'Model name too long').optional(),
            validityDays: z.number().positive('Validity days must be positive').max(3650, 'Maximum validity is 10 years').optional()
        })
    }),

    digitalKeyCertificateSchema: z.object({
        body: z.object({
            vehicleId: z.number().positive('Invalid vehicle ID'),
            permissions: z.object({
                unlock: z.boolean(),
                lock: z.boolean(),
                startEngine: z.boolean().optional(),
                engine_on: z.boolean().optional()
            }),
            validityDays: z.number().positive('Validity days must be positive').max(365, 'Maximum validity is 1 year').optional()
        })
    }),

    certificateVerificationSchema: z.object({
        body: z.object({
            certificate: z.object({
                version: z.string(),
                serialNumber: z.string(),
                issuer: z.string(),
                subject: z.object({}).passthrough(),
                publicKey: z.string(),
                validFrom: z.string(),
                validTo: z.string(),
                signature: z.string()
            })
        })
    }),

    serialNumberParamSchema: z.object({
        params: z.object({
            serialNumber: z.string().min(1, 'Serial number is required').max(64, 'Serial number too long')
        })
    }),

    vehicleIdParamSchema: z.object({
        params: z.object({
            vehicleId: z.string().regex(/^\d+$/, 'Vehicle ID must be a number')
        })
    }),

    revokeCertificateSchema: z.object({
        body: z.object({
            reason: z.string().max(100, 'Reason too long').optional()
        }),
        params: z.object({
            serialNumber: z.string().min(1, 'Serial number is required').max(64, 'Serial number too long')
        })
    }),

    renewCertificateSchema: z.object({
        body: z.object({
            validityDays: z.number().positive('Validity days must be positive').max(3650, 'Maximum validity is 10 years').optional()
        }),
        params: z.object({
            serialNumber: z.string().min(1, 'Serial number is required').max(64, 'Serial number too long')
        })
    }),

    exportCertificateSchema: z.object({
        params: z.object({
            serialNumber: z.string().min(1, 'Serial number is required').max(64, 'Serial number too long')
        }),
        query: z.object({
            format: z.enum(['json', 'pem']).optional()
        })
    })
};
