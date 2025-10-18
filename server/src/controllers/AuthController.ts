import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import UserModel from "../models/User";
import { generateTokens, verifyRefreshToken } from "../middleware/auth";
import LoggerService from "../services/LoggerService";

class AuthController {
  private userModel: UserModel;
  private logger: LoggerService;

  constructor() {
    this.userModel = new UserModel();
    this.logger = LoggerService.getInstance();
  }

  register = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { email, password, name } = req.body;

      const existingUser = await this.userModel.findByEmail(email);
      if (existingUser) {
        this.logger.auth("register_failed", {
          email,
          error: "Email already exists",
        });
        res.status(409).json({ error: "User with this email already exists" });
        return;
      }

      const user = await this.userModel.create({
        email,
        password_hash: password,
        name,
      });

      const tokens = generateTokens(user.id!);

      this.logger.auth("register_success", { email, userId: user.id });

      res.status(201).json({
        message: "User registered successfully",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        ...tokens,
      });
    } catch (error) {
      this.logger.error("Registration error", error, { requestData: req.body });
      res.status(500).json({ error: "Registration failed" });
    }
  };

  login = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      const user = await this.userModel.validatePassword(email, password);
      if (!user) {
        this.logger.auth("login_failed", {
          email,
          error: "Invalid credentials",
        });
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const tokens = generateTokens(user.id!);

      this.logger.auth("login_success", { email, userId: user.id });

      res.status(200).json({
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        ...tokens,
      });
    } catch (error) {
      this.logger.error("Login error", error, { requestData: req.body });
      res.status(500).json({ error: "Login failed" });
    }
  };

  refresh = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      const decoded = verifyRefreshToken(refreshToken);
      if (!decoded) {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      const user = await this.userModel.findById(decoded.userId);
      if (!user) {
        res.status(401).json({ error: "User not found" });
        return;
      }

      const tokens = generateTokens(user.id!);

      this.logger.auth("token_refresh", { userId: user.id });

      res.status(200).json({
        message: "Tokens refreshed successfully",
        ...tokens,
      });
    } catch (error) {
      this.logger.error("Token refresh error", error);
      res.status(500).json({ error: "Token refresh failed" });
    }
  };

  logout = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      this.logger.auth("logout", { userId: req.user?.id });

      res.status(200).json({
        message: "Logout successful",
      });
    } catch (error) {
      this.logger.error("Logout error", error);
      res.status(500).json({ error: "Logout failed" });
    }
  };

  profile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const user = await this.userModel.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      });
    } catch (error) {
      console.error("Profile fetch error:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  };

  updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { name, email } = req.body;
      const updateData: any = {};

      if (name) updateData.name = name;
      if (email) {
        const existingUser = await this.userModel.findByEmail(email);
        if (existingUser && existingUser.id !== userId) {
          res.status(409).json({ error: "Email already in use" });
          return;
        }
        updateData.email = email;
      }

      const updatedUser = await this.userModel.update(userId, updateData);
      if (!updatedUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(200).json({
        message: "Profile updated successfully",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          updated_at: updatedUser.updated_at,
        },
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  };

  changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      const user = await this.userModel.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const validatedUser = await this.userModel.validatePassword(
        user.email,
        currentPassword,
      );
      if (!validatedUser) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }

      await this.userModel.update(userId, { password_hash: newPassword });

      res.status(200).json({
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  };

  deleteAccount = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { password } = req.body;

      const user = await this.userModel.findById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const validatedUser = await this.userModel.validatePassword(
        user.email,
        password,
      );
      if (!validatedUser) {
        res.status(401).json({ error: "Password is incorrect" });
        return;
      }

      const VehicleModel = (await import("../models/Vehicle")).default;
      const vehicleModel = new VehicleModel();
      const userVehicles = await vehicleModel.findByOwnerId(userId);

      if (userVehicles.length > 0) {
        res.status(400).json({
          error:
            "Cannot delete account with registered vehicles. Please delete all vehicles first.",
        });
        return;
      }

      const DigitalKeyModel = (await import("../models/DigitalKey")).default;
      const keyModel = new DigitalKeyModel();
      const userKeys = await keyModel.findByUserId(userId);
      const activeKeys = userKeys.filter((key) => key.is_active);

      if (activeKeys.length > 0) {
        res.status(400).json({
          error:
            "Cannot delete account with active digital keys. Please revoke all keys first.",
        });
        return;
      }

      const deleted = await this.userModel.delete(userId);
      if (!deleted) {
        res.status(500).json({ error: "Failed to delete account" });
        return;
      }

      res.status(200).json({
        message: "Account deleted successfully",
      });
    } catch (error) {
      console.error("Account deletion error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  };
}

export default AuthController;
