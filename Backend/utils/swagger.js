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
            ageGroup: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/AgeGroup" }], nullable: true, description: "Absent for league: \"professional\" teams (Stage 13)" },
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
            isProfessional: { type: "boolean", default: false, description: "Stage 4b — an adult professional-league player. Server-set only (locked from the client); professional players carry no ageGroup and are owned by their creating proScout (createdBy), not a coach." },
            registrationType: { type: "string", enum: ["contract", "form"], nullable: true, default: null, description: "How the player is registered with their club: 'contract' (signed contract) or 'form' (registration form only). null when it has not been recorded yet. Replaces the former contractEndDate/isFreeAgent pair; players saved before the change have this derived from those legacy fields on read." },
            coach:     { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }] },
            observers: {
              type: "array",
              items: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }] },
            },
            createdBy: {
              oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }],
              description: "specs/010-professional-lens-creator — the user who created (and, for professional players, owns) this player. Populated only for admins — { _id, name } on GET /players, { _id, name, role } on GET /players/:id; a bare id (or absent) for every other role. Admins can list one proScout's players with GET /players?proScout=<id> (matched against createdBy).",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // ─── بنود تقييم التقرير: 10 مجموعات / 31 بند، كل بند 1→10 ─────────────
        // طلب مالك 2026-11-18. التعريف المرجعي في Backend/constants/reportMetrics.js
        // (الموديل والفاليديشن والإحصائيات بيشتقوا منه)، والسكيمات دي مكتوبة
        // بالإيد عن قصد: الوصف العربي لكل بند هو النص اللي المالك طلبه بالحرف،
        // وهو اللي بيوصل لأنواع الفرونت المولّدة من الـspec.
        DecisionMakingRatings: {
          type: "object",
          required: ["positioningAndPossession", "interceptingWithoutTackling"],
          properties: {
            positioningAndPossession:   { type: "number", minimum: 1, maximum: 10, description: "يتمركز جيدًا ويستحوذ على الكرة كثيرًا" },
            interceptingWithoutTackling:{ type: "number", minimum: 1, maximum: 10, description: "يقطع الكرات دون التحام" },
          },
        },

        SelfMotivationRatings: {
          type: "object",
          required: ["consistency", "winningBallBack", "coachability"],
          properties: {
            consistency:     { type: "number", minimum: 1, maximum: 10, description: "ثابت المستوى في كل الظروف" },
            winningBallBack: { type: "number", minimum: 1, maximum: 10, description: "يستعيد الكرة فور فقدانها" },
            coachability:    { type: "number", minimum: 1, maximum: 10, description: "يتقبل التوجيه ويتكيّف بسرعة" },
          },
        },

        TechnicalSkillsRatings: {
          type: "object",
          required: [
            "firstTouch", "twoFooted", "shieldingUnderPressure", "beatingOpponent",
            "longPassing", "shortPassing", "heading",
          ],
          properties: {
            firstTouch:             { type: "number", minimum: 1, maximum: 10, description: "لمسة أولى سريعة وفعّالة" },
            twoFooted:              { type: "number", minimum: 1, maximum: 10, description: "يجيد اللعب بالقدمين" },
            shieldingUnderPressure: { type: "number", minimum: 1, maximum: 10, description: "يحمي الكرة تحت الضغط" },
            beatingOpponent:        { type: "number", minimum: 1, maximum: 10, description: "يتجاوز المنافس بالمراوغة أو التمرير" },
            // اتضافوا 2026-11-25
            longPassing:            { type: "number", minimum: 1, maximum: 10, description: "التمريرات الطويلة الصحيحة" },
            shortPassing:           { type: "number", minimum: 1, maximum: 10, description: "التمريرات القصيرة الصحيحة" },
            heading:                { type: "number", minimum: 1, maximum: 10, description: "اللعب بالرأس" },
          },
        },

        PhysicalAbilitiesRatings: {
          type: "object",
          required: ["pace", "agility", "dynamism", "bodyUseInDuels"],
          properties: {
            pace:           { type: "number", minimum: 1, maximum: 10, description: "سريع" },
            agility:        { type: "number", minimum: 1, maximum: 10, description: "رشيق وسريع تغيير الاتجاه" },
            dynamism:       { type: "number", minimum: 1, maximum: 10, description: "ديناميكي ويقطع مسافات كبيرة" },
            bodyUseInDuels: { type: "number", minimum: 1, maximum: 10, description: "يستخدم جسمه بفاعلية في الالتحامات" },
          },
        },

        PersonalityRatings: {
          type: "object",
          required: ["leadership", "motivatingTeammates", "teamwork"],
          properties: {
            leadership:          { type: "number", minimum: 1, maximum: 10, description: "قيادي" },
            motivatingTeammates: { type: "number", minimum: 1, maximum: 10, description: "يحفّز زملاءه" },
            teamwork:            { type: "number", minimum: 1, maximum: 10, description: "قوي في العمل الجماعي" },
          },
        },

        SpecialDefendingRatings: {
          type: "object",
          required: ["blockingShots", "strongInDuels", "preventingPenetration"],
          properties: {
            blockingShots:         { type: "number", minimum: 1, maximum: 10, description: "صد التسديدات" },
            strongInDuels:         { type: "number", minimum: 1, maximum: 10, description: "قوي في الالتحامات" },
            preventingPenetration: { type: "number", minimum: 1, maximum: 10, description: "يمنع الاختراق في العمق" },
          },
        },

        SpecialAttackingRatings: {
          type: "object",
          required: ["buildUpPlay", "creatingGoals", "scoringGoals"],
          properties: {
            buildUpPlay:   { type: "number", minimum: 1, maximum: 10, description: "بناء اللعب" },
            creatingGoals: { type: "number", minimum: 1, maximum: 10, description: "صناعة الأهداف" },
            scoringGoals:  { type: "number", minimum: 1, maximum: 10, description: "تسجيل الأهداف" },
          },
        },

        WorkEthicRatings: {
          type: "object",
          required: ["maximumEffort", "continuousImprovement", "purposeAndDedication"],
          properties: {
            maximumEffort:         { type: "number", minimum: 1, maximum: 10, description: "يسعى لأقصى أداء" },
            continuousImprovement: { type: "number", minimum: 1, maximum: 10, description: "يرغب في التطور المستمر" },
            purposeAndDedication:  { type: "number", minimum: 1, maximum: 10, description: "واضح الهدف ومتفانٍ" },
          },
        },

        OnFieldLeadershipRatings: {
          type: "object",
          required: ["inspiringLeader", "teamSpirit"],
          properties: {
            inspiringLeader: { type: "number", minimum: 1, maximum: 10, description: "قيادي يلهم زملاءه" },
            teamSpirit:      { type: "number", minimum: 1, maximum: 10, description: "يلعب بروح الفريق" },
          },
        },

        WinningMentalityRatings: {
          type: "object",
          required: ["fullCommitment"],
          properties: {
            fullCommitment: { type: "number", minimum: 1, maximum: 10, description: "يقدّم أقصى ما لديه في كل تدريب ومباراة" },
          },
        },

        ScoutingReport: {
          type: "object",
          properties: {
            _id:           { type: "string" },
            player:        { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Player" }] },
            coach:         { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/User" }] },
            matchDate:     { type: "string", format: "date-time", description: "Set server-side to the report creation date" },
            matchType:     { type: "string", enum: ["official"], default: "official", description: "Always 'official' for new reports. Older reports may still carry the retired 'friendly'/'training' values." },
            seasonMatch:   { type: "string", nullable: true, description: "Scheduled match this report is tied to — resolved server-side from the player's fixtures for that day" },
            playedWithAgeGroup: { type: "string", nullable: true, description: "The age group the player actually played with, when the report is not tied to a scheduled match — a player may turn out for an older age group. The opposing team is then picked from that age group's teams, or typed free-text when it has none." },
            homeTeam:      { type: "string" },
            awayTeam:      { type: "string" },
            decisionMaking:    { $ref: "#/components/schemas/DecisionMakingRatings" },
            selfMotivation:    { $ref: "#/components/schemas/SelfMotivationRatings" },
            technicalSkills:   { $ref: "#/components/schemas/TechnicalSkillsRatings" },
            physicalAbilities: { $ref: "#/components/schemas/PhysicalAbilitiesRatings" },
            personality:       { $ref: "#/components/schemas/PersonalityRatings" },
            specialDefending:  { $ref: "#/components/schemas/SpecialDefendingRatings" },
            specialAttacking:  { $ref: "#/components/schemas/SpecialAttackingRatings" },
            workEthic:         { $ref: "#/components/schemas/WorkEthicRatings" },
            onFieldLeadership: { $ref: "#/components/schemas/OnFieldLeadershipRatings" },
            winningMentality:  { $ref: "#/components/schemas/WinningMentalityRatings" },
            overallRating: {
              type: "number", minimum: 1, maximum: 10,
              description: "Average of all 31 metrics, 1–10. Reports filed between 2026-11-18 and 2026-11-25 were rated 1–5, so their averages read low against newer ones; reports from before 2026-11-18 use a retired metric set entirely.",
            },
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
                observedPlayers:    { type: "integer", description: "Players whose status is observed (admin only — coach/proScout dashboards fold these into pendingPlayers)" },
                totalMedia:         { type: "integer" },
                totalCoaches:       { type: "integer" },
                totalObservers:     { type: "integer" },
                totalProScouts:     { type: "integer" },
                totalMatchesPlayed: { type: "integer" },
                topCoaches:         { type: "array", items: { $ref: "#/components/schemas/TopCoach" } },
              },
            },
          ],
        },

        ObserverDashboard: {
          type: "object",
          properties: {
            totalPlayersObserved: { type: "integer", description: "Every player the observer is on (scouted + followed)" },
            totalPlayers:         { type: "integer", description: "Players this observer is the scout of" },
            selectedPlayers:      { type: "integer" },
            pendingPlayers:       { type: "integer", description: "Scouted players pending or observed" },
            rejectedPlayers:      { type: "integer" },
            selectionRate:        { type: "number" },
            followedPlayers:      { type: "integer", description: "Players the observer follows but is not the scout of" },
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
            selectedPlayers:       { type: "integer" },
            pendingPlayers:        { type: "integer" },
            rejectedPlayers:       { type: "integer" },
            upcomingMatchesCount:  { type: "integer" },
            totalReports:          { type: "integer" },
            upcomingMatches:       { type: "array", items: { $ref: "#/components/schemas/ProScoutMatch" } },
            latestResults:         { type: "array", items: { $ref: "#/components/schemas/ProScoutMatch" } },
            recentReports:         { type: "array", items: { $ref: "#/components/schemas/ProScoutReport" } },
          },
        },

        // مسطّح بمستوى واحد عن قصد (مش متداخل تحت المجموعات) — الواجهة بتقرأه
        // كـ Record<string, number>. أسماء البنود فريدة على مستوى المجموعات
        // كلها، وفي حارس على ده في Backend/constants/reportMetrics.js.
        ReportStatistics: {
          type: "object",
          properties: {
            totalReports:   { type: "integer" },
            lastReport:     { type: "string", format: "date-time" },
            overallRating:  { type: "number" },

            // اتخاذ القرار
            positioningAndPossession:    { type: "number" },
            interceptingWithoutTackling: { type: "number" },
            // الدافعية الذاتية
            consistency:     { type: "number" },
            winningBallBack: { type: "number" },
            coachability:    { type: "number" },
            // المهارات الفنية
            firstTouch:             { type: "number" },
            twoFooted:              { type: "number" },
            shieldingUnderPressure: { type: "number" },
            beatingOpponent:        { type: "number" },
            // القدرات البدنية
            pace:           { type: "number" },
            agility:        { type: "number" },
            dynamism:       { type: "number" },
            bodyUseInDuels: { type: "number" },
            // الشخصية
            leadership:          { type: "number" },
            motivatingTeammates: { type: "number" },
            teamwork:            { type: "number" },
            // القدرات الخاصة – الدفاع
            blockingShots:         { type: "number" },
            strongInDuels:         { type: "number" },
            preventingPenetration: { type: "number" },
            // القدرات الخاصة – الهجوم
            buildUpPlay:   { type: "number" },
            creatingGoals: { type: "number" },
            scoringGoals:  { type: "number" },
            // أخلاقيات العمل
            maximumEffort:         { type: "number" },
            continuousImprovement: { type: "number" },
            purposeAndDedication:  { type: "number" },
            // التوجيه داخل الملعب
            inspiringLeader: { type: "number" },
            teamSpirit:      { type: "number" },
            // عقلية الفوز
            fullCommitment: { type: "number" },
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
