import swaggerJsDoc from "swagger-jsdoc";
import { ROLE_VALUES } from "../constants/roles.js";

const options = {
  definition: {
    openapi: "3.0.0",

    info: {
      title: "Talent Radar API",
      version: "1.0.0",
      description: "REST API for the Talent Radar sports talent management platform.",
    },

    servers: [
      {
        url: "http://localhost:3000/api/v1",
        description: "Local development",
      },
    ],

    tags: [
      { name: "Auth",      description: "Authentication & password management" },
      { name: "Users",     description: "User management (admin only)" },
      { name: "Players",   description: "Player CRUD & status management" },
      { name: "Reports",   description: "Scouting reports (nested under players)" },
      { name: "Media",     description: "Player media uploads" },
      { name: "Dashboard", description: "Aggregated statistics" },
      { name: "AgeGroups", description: "Age group reference data" },
      { name: "Teams",     description: "Teams registered under an age group" },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        vaultToken: {
          type: "apiKey",
          in: "header",
          name: "X-Vault-Token",
          description: "15-minute token obtained via POST /auth/vaultPassword/verify — required to read ID-card vault endpoints (C3)",
        },
      },

      schemas: {

        // ─── Core domain ─────────────────────────────────────────────────────

        AgeGroup: {
          type: "object",
          properties: {
            _id:  { type: "string" },
            name: { type: "string", example: "2012" },
            birthYear: { type: "integer", example: 2012 },
          },
        },

        User: {
          type: "object",
          properties: {
            _id:           { type: "string" },
            name:          { type: "string" },
            email:         { type: "string", format: "email" },
            role:          { type: "string", enum: ROLE_VALUES },
            phoneNumber:   { type: "string" },
            profileImg:    { type: "string" },
            address:       { type: "string" },
            birthDate:     { type: "string", format: "date" },
            active:        { type: "boolean" },
            deactivatedAt: { type: "string", format: "date-time", nullable: true },
            createdAt:     { type: "string", format: "date-time" },
            updatedAt:     { type: "string", format: "date-time" },
          },
        },

        Team: {
          type: "object",
          properties: {
            _id:      { type: "string" },
            name:     { type: "string" },
            ageGroup: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/AgeGroup" }] },
            league:   { type: "string", enum: ["premier", "professional"] },
            clubName: { type: "string" },
            active:   { type: "boolean" },
          },
        },

        Player: {
          type: "object",
          properties: {
            _id:          { type: "string" },
            name:         { type: "string" },
            dateOfBirth:  { type: "string", format: "date" },
            city:         { type: "string" },
            address:      { type: "string" },
            phoneNumber:  { type: "string" },
            height:       { type: "number" },
            weight:       { type: "number" },
            team:         { type: "string" },
            teamName:     { type: "string", description: "Free-text team name, used when the team isn't in the registered teams list (mutually exclusive with team)" },
            position: {
              type: "string",
              enum: ["GK", "CB", "LB", "RB", "CM", "DM", "AM", "LW", "RW", "ST"],
            },
            preferredFoot: { type: "string", enum: ["right", "left", "both"] },
            nationality:   { type: "string" },
            notes:         { type: "string" },
            profileImg:    { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "selected", "rejected", "observed"],
              default: "pending",
            },
            ageGroup:  { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/AgeGroup" }] },
            coach:     { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }] },
            observers: {
              type: "array",
              items: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }] },
            },
            createdBy: {
              oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }],
              description: "specs/010-professional-lens-creator — the user who created this player. Populated to { _id, name } only for GET /players requests made by an admin; absent for every other role and for GET /players/:id.",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        TechnicalSkills: {
          type: "object",
          required: ["passing", "dribbling", "shooting", "ballControl"],
          properties: {
            passing:     { type: "number", minimum: 1, maximum: 10 },
            dribbling:   { type: "number", minimum: 1, maximum: 10 },
            shooting:    { type: "number", minimum: 1, maximum: 10 },
            ballControl: { type: "number", minimum: 1, maximum: 10 },
          },
        },

        PhysicalSkills: {
          type: "object",
          required: ["speed", "stamina", "strength", "agility"],
          properties: {
            speed:    { type: "number", minimum: 1, maximum: 10 },
            stamina:  { type: "number", minimum: 1, maximum: 10 },
            strength: { type: "number", minimum: 1, maximum: 10 },
            agility:  { type: "number", minimum: 1, maximum: 10 },
          },
        },

        MentalSkills: {
          type: "object",
          required: ["positioning", "decisionMaking", "teamwork", "attitude"],
          properties: {
            positioning:    { type: "number", minimum: 1, maximum: 10 },
            decisionMaking: { type: "number", minimum: 1, maximum: 10 },
            teamwork:       { type: "number", minimum: 1, maximum: 10 },
            attitude:       { type: "number", minimum: 1, maximum: 10 },
          },
        },

        ScoutingReport: {
          type: "object",
          properties: {
            _id:           { type: "string" },
            player:        { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Player" }] },
            coach:         { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }] },
            matchDate:     { type: "string", format: "date-time", description: "Set server-side to the report creation date" },
            homeTeam:      { type: "string" },
            awayTeam:      { type: "string" },
            technical:     { $ref: "#/components/schemas/TechnicalSkills" },
            physical:      { $ref: "#/components/schemas/PhysicalSkills" },
            mental:        { $ref: "#/components/schemas/MentalSkills" },
            overallRating: { type: "number", minimum: 1, maximum: 10 },
            notes:         { type: "string" },
            createdAt:     { type: "string", format: "date-time" },
            updatedAt:     { type: "string", format: "date-time" },
          },
        },

        PlayerMedia: {
          type: "object",
          properties: {
            _id:         { type: "string" },
            player:      { type: "string" },
            uploadedBy:  { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }] },
            type:        { type: "string", enum: ["image", "video"] },
            status:      { type: "string", enum: ["processing", "ready", "failed"], description: "Videos transcode on Bunny; images are ready immediately" },
            url:         { type: "string", format: "uri", nullable: true, description: "Signed, short-lived delivery URL generated on read (HLS for video, token URL for images); null while a video is processing/failed" },
            embedUrl:    { type: "string", format: "uri", description: "Bunny token-embed iframe URL (video, when ready)" },
            thumbnail:   { type: "string", format: "uri", description: "Signed thumbnail URL (video, when ready)" },
            download:    { type: "string", description: "Backend download endpoint for the 720p MP4 (video, when ready)" },
            title:       { type: "string" },
            description: { type: "string" },
            seasonMatch: { type: "string", nullable: true, description: "Set on videos only, auto-resolved server-side from the player's team fixtures — never client-supplied" },
            linkedVideo: { type: "string", nullable: true, description: "Set on companion images only — the PlayerMedia id of the video this image was uploaded alongside" },
            reviewStatus: { type: "string", enum: ["pending", "approved", "rejected"], nullable: true },
            createdAt:   { type: "string", format: "date-time" },
            updatedAt:   { type: "string", format: "date-time" },
          },
        },

        // ─── Dashboard ───────────────────────────────────────────────────────

        CoachDashboard: {
          type: "object",
          properties: {
            totalPlayers:    { type: "integer" },
            selectedPlayers: { type: "integer" },
            pendingPlayers:  { type: "integer" },
            rejectedPlayers: { type: "integer" },
            totalReports:    { type: "integer" },
            matchesAttended: { type: "integer" },
            selectionRate:   { type: "string", example: "42.00" },
          },
        },

        TopCoach: {
          type: "object",
          properties: {
            coachName:       { type: "string" },
            selectedPlayers: { type: "integer" },
          },
        },

        AdminDashboard: {
          allOf: [
            { $ref: "#/components/schemas/CoachDashboard" },
            {
              type: "object",
              properties: {
                totalMedia:         { type: "integer" },
                totalCoaches:       { type: "integer" },
                totalMatchesPlayed: { type: "integer" },
                topCoaches:         { type: "array", items: { $ref: "#/components/schemas/TopCoach" } },
              },
            },
          ],
        },

        ObserverDashboard: {
          type: "object",
          properties: {
            totalPlayersObserved: { type: "integer" },
            totalReports:         { type: "integer" },
            totalMedia:           { type: "integer" },
            totalMatches:         { type: "integer" },
          },
        },

        // Stage 5 — no ageGroup at any depth in this schema (FR-005). Team refs are
        // deliberately thin (id/name/clubName) — same fields the coach/observer
        // dashboards never needed to expose beyond.
        ProScoutMatchTeamRef: {
          type: "object",
          properties: {
            _id:      { type: "string" },
            name:     { type: "string" },
            clubName: { type: "string" },
          },
        },

        ProScoutMatchResult: {
          type: "object",
          nullable: true,
          properties: {
            homeScore: { type: "integer" },
            awayScore: { type: "integer" },
          },
        },

        ProScoutMatch: {
          type: "object",
          properties: {
            _id:       { type: "string" },
            matchDate: { type: "string", format: "date-time" },
            homeTeam:  { $ref: "#/components/schemas/ProScoutMatchTeamRef" },
            awayTeam:  { $ref: "#/components/schemas/ProScoutMatchTeamRef" },
            venue:     { type: "string", nullable: true },
            status:    { type: "string", enum: ["scheduled", "completed", "cancelled", "postponed"] },
            result:    { $ref: "#/components/schemas/ProScoutMatchResult" },
          },
        },

        ProScoutReportPlayerRef: {
          type: "object",
          properties: {
            _id:      { type: "string" },
            name:     { type: "string" },
            position: { type: "string" },
          },
        },

        ProScoutReport: {
          type: "object",
          properties: {
            _id:            { type: "string" },
            player:         { $ref: "#/components/schemas/ProScoutReportPlayerRef" },
            matchDate:      { type: "string", format: "date-time" },
            overallRating:  { type: "number" },
          },
        },

        ProScoutDashboard: {
          type: "object",
          properties: {
            totalPlayers:          { type: "integer" },
            upcomingMatchesCount:  { type: "integer" },
            totalReports:          { type: "integer" },
            upcomingMatches:       { type: "array", items: { $ref: "#/components/schemas/ProScoutMatch" } },
            latestResults:         { type: "array", items: { $ref: "#/components/schemas/ProScoutMatch" } },
            recentReports:         { type: "array", items: { $ref: "#/components/schemas/ProScoutReport" } },
          },
        },

        ReportStatistics: {
          type: "object",
          properties: {
            totalReports:   { type: "integer" },
            lastReport:     { type: "string", format: "date-time" },
            overallRating:  { type: "number" },
            passing:        { type: "number" },
            dribbling:      { type: "number" },
            shooting:       { type: "number" },
            ballControl:    { type: "number" },
            speed:          { type: "number" },
            stamina:        { type: "number" },
            strength:       { type: "number" },
            agility:        { type: "number" },
            positioning:    { type: "number" },
            decisionMaking: { type: "number" },
            teamwork:       { type: "number" },
            attitude:       { type: "number" },
          },
        },

        // ─── Shared response wrappers ─────────────────────────────────────────

        Pagination: {
          type: "object",
          properties: {
            currentPage:   { type: "integer" },
            limit:         { type: "integer" },
            numberOfPages: { type: "integer" },
            next:          { type: "integer", nullable: true },
            prev:          { type: "integer", nullable: true },
          },
        },

        ErrorResponse: {
          type: "object",
          properties: {
            status:  { type: "string", example: "fail" },
            message: { type: "string" },
          },
        },
      },

      // ─── Reusable response objects ──────────────────────────────────────────

      responses: {
        Unauthorized: {
          description: "Missing or invalid JWT token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        Forbidden: {
          description: "Authenticated but insufficient role",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        ValidationError: {
          description: "Request validation failed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        NoContent: {
          description: "Operation successful — no body returned",
        },
      },
    },

    security: [{ bearerAuth: [] }],
  },

  apis: ["./routes/*.js", "./routes/**/*.js"],
};

const specs = swaggerJsDoc(options);

export default specs;
