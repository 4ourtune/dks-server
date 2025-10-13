import { Request, Response, NextFunction } from 'express';

interface ClientData {
    count: number;
    resetTime: number;
}

const requests = new Map<string, ClientData>();

export const createRateLimiter = (windowMs: number, max: number) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const clientId = req.ip || 'unknown';
        const now = Date.now();
        
        const clientData = requests.get(clientId);
        
        if (!clientData || now > clientData.resetTime) {
            requests.set(clientId, {
                count: 1,
                resetTime: now + windowMs
            });
            next();
            return;
        }
        
        if (clientData.count >= max) {
            res.status(429).json({
                success: false,
                error: 'Too many requests',
                message: 'Rate limit exceeded',
                retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
            });
            return;
        }
        
        clientData.count++;
        next();
    };
};

export const rateLimit = createRateLimiter;
