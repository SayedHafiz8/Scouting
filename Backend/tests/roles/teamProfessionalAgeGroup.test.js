import { describe, it, expect } from "vitest";
import request from "supertest";

import app from "../../app.js";
import Team from "../../models/teamModel.js";
import { createAdmin, seedAgeGroups } from "../helpers/factory.js";

// ============================================================================
// Stage 13 (US2, contracts/teams-professional.md) — Team.ageGroup becomes
// conditionally required: professional-league teams carry none (mirroring
// Player.isProfessional, constitution v1.2.0 C-4); premier-league teams are
// unaffected (regression).
// ============================================================================

describe("Stage 13 — professional-league Team.ageGroup", () => {
    it("POST /teams with league: professional and no ageGroup → 201, saved with no ageGroup", async () => {
        const { token } = await createAdmin({ email: "team_prof_admin1@test.com" });

        const res = await request(app)
            .post("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Al Nasr", clubName: "Al Nasr Club", league: "professional" })
            .expect(201);

        expect(res.body.data.document.ageGroup).toBeFalsy();

        const saved = await Team.findById(res.body.data.document._id).setOptions({ bypassFilter: true });
        expect(saved.ageGroup).toBeUndefined();
    });

    it("POST /teams with league: premier and no ageGroup → still 400, unchanged message (regression)", async () => {
        const { token } = await createAdmin({ email: "team_prof_admin2@test.com" });

        const res = await request(app)
            .post("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Youth FC", clubName: "Youth Club", league: "premier" })
            .expect(400);

        expect(JSON.stringify(res.body)).toMatch(/ageGroup/i);
    });

    it("DELETE /teams/:id on a professional team works unchanged", async () => {
        const { token } = await createAdmin({ email: "team_prof_admin3@test.com" });

        const create = await request(app)
            .post("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Al Ahly Pro", clubName: "Al Ahly", league: "professional" })
            .expect(201);

        await request(app)
            .delete(`/api/v1/teams/${create.body.data.document._id}`)
            .set("Authorization", `Bearer ${token}`)
            .expect(204);

        const found = await Team.findById(create.body.data.document._id);
        expect(found).toBeNull();
    });

    it("POST /teams with league: premier and a valid ageGroup still requires it exactly as before", async () => {
        await seedAgeGroups();
        const { token } = await createAdmin({ email: "team_prof_admin4@test.com" });
        const AgeGroup = (await import("../../models/ageGroupModel.js")).default;
        const ageGroup = await AgeGroup.findOne();

        const res = await request(app)
            .post("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Premier FC", clubName: "Premier Club", league: "premier", ageGroup: ageGroup._id.toString() })
            .expect(201);

        expect(res.body.data.document.ageGroup).toBeTruthy();
    });
});
