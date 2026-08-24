import { describe, it, expect } from "vitest";
import request from "supertest";

import app from "../../app.js";
import AgeGroup from "../../models/ageGroupModel.js";
import { createAdmin, seedAgeGroups } from "../helpers/factory.js";

// ============================================================================
// Stage 13 (US3, contracts/season-matches-professional.md, research.md R6) —
// the crash-fix regression: creating/editing a professional-league fixture
// between two professional teams (ageGroup: undefined on both) must succeed
// with 201/200, not crash with a 500 TypeError inside
// teamBelongsToMatchAgeGroup (team.ageGroup.toString() on undefined).
// ============================================================================

async function createProfessionalTeam(token, name) {
    const res = await request(app)
        .post("/api/v1/teams")
        .set("Authorization", `Bearer ${token}`)
        .send({ name, clubName: `${name} Club`, league: "professional" })
        .expect(201);
    return res.body.data.document._id;
}

describe("Stage 13 — professional-league SeasonMatch.ageGroup (R6 crash fix)", () => {
    it("POST /seasonMatches with league: professional, two professional teams, no ageGroup → 201, not 500", async () => {
        const { token } = await createAdmin({ email: "match_prof_admin1@test.com" });
        const homeTeam = await createProfessionalTeam(token, "Pro Home A");
        const awayTeam = await createProfessionalTeam(token, "Pro Away A");

        const res = await request(app)
            .post("/api/v1/seasonMatches")
            .set("Authorization", `Bearer ${token}`)
            .send({
                league: "professional",
                season: "2025/2026",
                matchDate: new Date(Date.now() + 86400000).toISOString(),
                homeTeam,
                awayTeam,
                venue: "Cairo Stadium",
            })
            .expect(201);

        expect(res.body.data.document.ageGroup).toBeFalsy();
    });

    it("PATCH /seasonMatches/:id on a professional fixture → 200, not 500 (R6)", async () => {
        const { token } = await createAdmin({ email: "match_prof_admin2@test.com" });
        const homeTeam = await createProfessionalTeam(token, "Pro Home B");
        const awayTeam = await createProfessionalTeam(token, "Pro Away B");

        const create = await request(app)
            .post("/api/v1/seasonMatches")
            .set("Authorization", `Bearer ${token}`)
            .send({
                league: "professional",
                season: "2025/2026",
                matchDate: new Date(Date.now() + 86400000).toISOString(),
                homeTeam,
                awayTeam,
                venue: "Cairo Stadium",
            })
            .expect(201);

        await request(app)
            .patch(`/api/v1/seasonMatches/${create.body.data.document._id}`)
            .set("Authorization", `Bearer ${token}`)
            .send({ venue: "Alexandria Stadium" })
            .expect(200);
    });

    it("POST /seasonMatches with league: premier and no ageGroup → still 400, unchanged message (regression)", async () => {
        await seedAgeGroups();
        const { token } = await createAdmin({ email: "match_prof_admin3@test.com" });
        const ageGroup = await AgeGroup.findOne();

        const teamRes1 = await request(app)
            .post("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Youth Home", clubName: "Youth Club", league: "premier", ageGroup: ageGroup._id.toString() })
            .expect(201);
        const teamRes2 = await request(app)
            .post("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Youth Away", clubName: "Youth Club", league: "premier", ageGroup: ageGroup._id.toString() })
            .expect(201);

        const res = await request(app)
            .post("/api/v1/seasonMatches")
            .set("Authorization", `Bearer ${token}`)
            .send({
                league: "premier",
                season: "2025/2026",
                matchDate: new Date(Date.now() + 86400000).toISOString(),
                homeTeam: teamRes1.body.data.document._id,
                awayTeam: teamRes2.body.data.document._id,
            })
            .expect(400);

        expect(JSON.stringify(res.body)).toMatch(/ageGroup/i);
    });

    it("still rejects a premier fixture whose home/away teams belong to a different age group", async () => {
        await seedAgeGroups();
        const { token } = await createAdmin({ email: "match_prof_admin4@test.com" });
        const groups = await AgeGroup.find().limit(2);
        const [ageGroupA, ageGroupB] = groups;

        const teamA = await request(app)
            .post("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Team A", clubName: "Club A", league: "premier", ageGroup: ageGroupA._id.toString() })
            .expect(201);
        const teamB = await request(app)
            .post("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Team B", clubName: "Club B", league: "premier", ageGroup: ageGroupB._id.toString() })
            .expect(201);

        await request(app)
            .post("/api/v1/seasonMatches")
            .set("Authorization", `Bearer ${token}`)
            .send({
                league: "premier",
                ageGroup: ageGroupA._id.toString(),
                season: "2025/2026",
                matchDate: new Date(Date.now() + 86400000).toISOString(),
                homeTeam: teamA.body.data.document._id,
                awayTeam: teamB.body.data.document._id,
            })
            .expect(400);
    });

    it("still rejects pairing a professional team into a premier fixture (league mismatch check)", async () => {
        await seedAgeGroups();
        const { token } = await createAdmin({ email: "match_prof_admin5@test.com" });
        const ageGroup = await AgeGroup.findOne();

        const premierTeam = await request(app)
            .post("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Premier Team", clubName: "Club", league: "premier", ageGroup: ageGroup._id.toString() })
            .expect(201);
        const proTeam = await createProfessionalTeam(token, "Pro Mismatch");

        await request(app)
            .post("/api/v1/seasonMatches")
            .set("Authorization", `Bearer ${token}`)
            .send({
                league: "premier",
                ageGroup: ageGroup._id.toString(),
                season: "2025/2026",
                matchDate: new Date(Date.now() + 86400000).toISOString(),
                homeTeam: premierTeam.body.data.document._id,
                awayTeam: proTeam,
            })
            .expect(400);
    });
});
