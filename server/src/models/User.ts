import Database from '../database/connection';
import { User } from '../types';
import bcrypt from 'bcryptjs';

class UserModel {
    private db: Database;

    constructor() {
        this.db = Database.getInstance();
    }

    async create(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
        const hashedPassword = await bcrypt.hash(userData.password_hash, 12);
        
        const result = await this.db.run(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
            [userData.email, hashedPassword, userData.name]
        );

        const user = await this.findById(result.lastID!);
        return user!;
    }

    async findById(id: number): Promise<User | null> {
        const user = await this.db.get(
            'SELECT id, email, password_hash, name, created_at, updated_at FROM users WHERE id = $1',
            [id]
        );
        return user || null;
    }

    async findByEmail(email: string): Promise<User | null> {
        const user = await this.db.get(
            'SELECT id, email, password_hash, name, created_at, updated_at FROM users WHERE email = $1',
            [email]
        );
        return user || null;
    }

    async update(id: number, userData: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>): Promise<User | null> {
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        if (userData.name) {
            updateFields.push(`name = $${updateValues.length + 1}`);
            updateValues.push(userData.name);
        }

        if (userData.email) {
            updateFields.push(`email = $${updateValues.length + 1}`);
            updateValues.push(userData.email);
        }

        if (userData.password_hash) {
            const hashedPassword = await bcrypt.hash(userData.password_hash, 12);
            updateFields.push(`password_hash = $${updateValues.length + 1}`);
            updateValues.push(hashedPassword);
        }

        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(id);

        await this.db.run(
            `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${updateValues.length}`,
            updateValues
        );

        return this.findById(id);
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.db.run('DELETE FROM users WHERE id = $1', [id]);
        return result.changes! > 0;
    }

    async validatePassword(email: string, password: string): Promise<User | null> {
        const user = await this.findByEmail(email);
        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) return null;

        return user;
    }

    async getAllUsers(): Promise<User[]> {
        const users = await this.db.all(
            'SELECT id, email, name, created_at, updated_at FROM users ORDER BY created_at DESC'
        );
        return users;
    }
}

export default UserModel;
