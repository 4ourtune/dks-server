process.env.NODE_ENV = "test";

const { describe, it, beforeAll, afterAll, beforeEach, expect } = require("@jest/globals");
const request = require("supertest");
const App = require("../dist/app").default;
const Database = require("../dist/database/connection").default;

const clearDatabase = async () => {
  const db = Database.getInstance();
  await db.query(
    "TRUNCATE TABLE certificate_revocation_list, certificates, pki_sessions, pairing_sessions, digital_keys, vehicles, users RESTART IDENTITY CASCADE",
  );
};

describe("Authentication API", () => {
  let app;
  let server;

  beforeAll(async () => {
    app = new App();
    server = app.app;
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user successfully", async () => {
      const userData = {
        email: "test@example.com",
        password: "Test123!@#",
        name: "Test User",
      };

      const response = await request(server)
        .post("/api/auth/register")
        .send(userData)
        .expect(201);

      expect(response.body.message).toBe("User registered successfully");
      expect(response.body.user).toHaveProperty("id");
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
    });

    it("should reject duplicate email registration", async () => {
      const userData = {
        email: "duplicate@example.com",
        password: "Test123!@#",
        name: "Test User",
      };

      await request(server)
        .post("/api/auth/register")
        .send(userData)
        .expect(201);

      await request(server)
        .post("/api/auth/register")
        .send(userData)
        .expect(409);
    });

    it("should reject invalid password", async () => {
      const userData = {
        email: "weak@example.com",
        password: "weak",
        name: "Test User",
      };

      await request(server)
        .post("/api/auth/register")
        .send(userData)
        .expect(400);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      const userData = {
        email: "login@example.com",
        password: "Test123!@#",
        name: "Login User",
      };

      await request(server).post("/api/auth/register").send(userData);
    });

    it("should login successfully with valid credentials", async () => {
      const loginData = {
        email: "login@example.com",
        password: "Test123!@#",
      };

      const response = await request(server)
        .post("/api/auth/login")
        .send(loginData)
        .expect(200);

      expect(response.body.message).toBe("Login successful");
      expect(response.body.user).toHaveProperty("id");
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
    });

    it("should reject invalid credentials", async () => {
      const loginData = {
        email: "login@example.com",
        password: "wrongpassword",
      };

      await request(server).post("/api/auth/login").send(loginData).expect(401);
    });
  });

  describe("GET /api/auth/profile", () => {
    let accessToken;

    beforeEach(async () => {
      const userData = {
        email: "profile@example.com",
        password: "Test123!@#",
        name: "Profile User",
      };

      const response = await request(server)
        .post("/api/auth/register")
        .send(userData);

      accessToken = response.body.accessToken;
    });

    it("should return user profile with valid token", async () => {
      const response = await request(server)
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).toHaveProperty("id");
      expect(response.body.user.email).toBe("profile@example.com");
      expect(response.body.user.name).toBe("Profile User");
    });

    it("should reject request without token", async () => {
      await request(server).get("/api/auth/profile").expect(401);
    });
  });
});

module.exports = {};
