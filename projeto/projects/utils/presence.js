// projects/utils/presence.js
const Presence = require("../models/presence");
const axios = require("axios");
const { httpsAgent } = require("../utils/httpsAgent");

const ACTIVE_WINDOW_MS = Number(process.env.PRESENCE_ACTIVE_WINDOW_MS || 15_000);
const USERS_MS = process.env.USERS_MS || "https://users:10001/";
const FREE_LIMIT = Number(process.env.PRESENCE_LIMIT_NON_PREMIUM || 2);

async function getUserType(userId) {
  if (!userId) return null;

  try {
    const resp = await axios.get(`${USERS_MS}${userId}/type`, {
      httpsAgent,
      timeout: 5000,
    });
    return resp.data?.type ?? null;
  } catch (err) {
    // Se o users-ms falhar, escolhe um comportamento conservador:
    // tratar como não-premium para não abrir ilimitado por acidente.
    return "free";
  }
}

async function ensureEditorSlot({ ownerId, projectId, callerId }) {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);

  const ownerType = await getUserType(ownerId);

  // PREMIUM OWNER => ilimitado (idempotente)
  if (ownerType === "premium") {
    await Presence.updateOne(
      { ownerId, projectId, userId: callerId },
      { $set: { lastSeenAt: new Date() } },
      { upsert: true }
    );

    return { ok: true, ownerType, active: null, limit: null };
  }

  // 🧹 limpar presenças antigas
  await Presence.deleteMany({
    ownerId,
    projectId,
    lastSeenAt: { $lt: cutoff },
  });

  // 1️⃣ Se já existe presença deste utilizador → refresca e termina
  const existing = await Presence.findOne({ ownerId, projectId, userId: callerId });
  if (existing) {
    await Presence.updateOne(
      { ownerId, projectId, userId: callerId },
      { $set: { lastSeenAt: new Date() } }
    );

    const active = await Presence.countDocuments({
      ownerId,
      projectId,
      lastSeenAt: { $gte: cutoff },
    });

    return { ok: true, ownerType, active, limit: FREE_LIMIT };
  }

  // 2️⃣ Contar editores ativos
  const active = await Presence.countDocuments({
    ownerId,
    projectId,
    lastSeenAt: { $gte: cutoff },
  });

  if (active >= FREE_LIMIT) {
    return { ok: false, ownerType, active, limit: FREE_LIMIT };
  }

  // 3️⃣ Criar presença de forma segura (idempotente + tolerância a race)
  try {
    await Presence.updateOne(
      { ownerId, projectId, userId: callerId },
      { $set: { lastSeenAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    if (e?.code !== 11000) throw e;

    // Se houve corrida e já foi criado, apenas refresca
    await Presence.updateOne(
      { ownerId, projectId, userId: callerId },
      { $set: { lastSeenAt: new Date() } }
    );
  }

  return { ok: true, ownerType, active: active + 1, limit: FREE_LIMIT };
}

async function releaseEditorSlot({ ownerId, projectId, callerId }) {
  await Presence.deleteOne({ ownerId, projectId, userId: callerId });
}

module.exports = { ensureEditorSlot, releaseEditorSlot, getUserType };
