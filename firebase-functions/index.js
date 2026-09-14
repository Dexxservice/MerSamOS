const { onValueCreated, onValueUpdated } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const REGION = "europe-west1";
const TIMEZONE = "Europe/Berlin";
const USERS = ["Samet", "Meriam"];

function otherUser(name) {
  return name === "Samet" ? "Meriam" : "Samet";
}

function truncate(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

async function sendToUser(partner, title, body, tag) {
  const db = getDatabase();
  const tokensSnap = await db.ref(`pushTokens/${partner}`).get();
  if (!tokensSnap.exists()) return;

  const tokens = Object.keys(tokensSnap.val());
  if (tokens.length === 0) return;

  const response = await getMessaging().sendEachForMulticast({
    notification: { title, body },
    data: { tag },
    tokens,
  });

  const invalidTokens = [];
  response.responses.forEach((res, idx) => {
    if (!res.success) {
      const code = res.error && res.error.code;
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        invalidTokens.push(tokens[idx]);
      }
    }
  });
  await Promise.all(
    invalidTokens.map((t) => db.ref(`pushTokens/${partner}/${t}`).remove())
  );
}

async function sendToBoth(title, body, tag) {
  await Promise.all(USERS.map((u) => sendToUser(u, title, body, tag)));
}

// ============================================================
// PHASE 1 — Reaktive Trigger (feuern bei konkreten Aktionen)
// ============================================================

// Love-Letter / Post-it
exports.onLoveLetterCreated = onValueCreated(
  { ref: "/loveLetters/{pushId}", region: REGION },
  async (event) => {
    const letter = event.data.val();
    if (!letter || !letter.by || !letter.text) return;

    const partner = otherUser(letter.by);
    await sendToUser(
      partner,
      `💌 Neue Nachricht von ${letter.by}`,
      truncate(letter.text, 100),
      "love-letter"
    );
  }
);

// Milestone-Kommentar
exports.onWishCommentCreated = onValueCreated(
  { ref: "/wishes/{wishId}/comments/{commentId}", region: REGION },
  async (event) => {
    const comment = event.data.val();
    if (!comment || !comment.by || !comment.text) return;

    const wishId = event.params.wishId;
    const db = getDatabase();
    const wishSnap = await db.ref(`wishes/${wishId}/text`).get();
    const wishTitle = wishSnap.val() || "eurem Moment";

    const partner = otherUser(comment.by);
    await sendToUser(
      partner,
      `💬 ${comment.by} hat kommentiert`,
      `"${wishTitle}": ${truncate(comment.text, 80)}`,
      "wish-comment"
    );
  }
);

// Neues Foto hinzugefügt ODER ein bestehendes Foto ersetzt
exports.onMemoryPhotoAdded = onValueUpdated(
  { ref: "/wishes/{wishId}/memoryPhotos", region: REGION },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const beforeArr = Array.isArray(before) ? before : [];
    const afterArr = Array.isArray(after) ? after : [];
    if (afterArr.length === 0) return;

    const grew = afterArr.length > beforeArr.length;
    const replaced =
      !grew &&
      afterArr.length === beforeArr.length &&
      JSON.stringify(afterArr) !== JSON.stringify(beforeArr);
    if (!grew && !replaced) return;

    const wishId = event.params.wishId;
    const db = getDatabase();
    const wishSnap = await db.ref(`wishes/${wishId}`).get();
    const wish = wishSnap.val();
    if (!wish || !wish.by) return;

    const partner = otherUser(wish.by);
    await sendToUser(
      partner,
      grew ? "📸 Neues Foto hinzugefügt" : "📸 Foto aktualisiert",
      `Bei "${wish.text || "eurem Moment"}" gibt's was Neues zu sehen.`,
      "memory-photo"
    );
  }
);

// Neuer Bucket-Traum ODER neuer (nachgetragener) Meilenstein
exports.onWishCreated = onValueCreated(
  { ref: "/wishes/{wishId}", region: REGION },
  async (event) => {
    const wish = event.data.val();
    if (!wish || !wish.by || !wish.text) return;

    const partner = otherUser(wish.by);

    if (wish.isBucket === true && wish.status === "open") {
      await sendToUser(
        partner,
        "✨ Neuer Bucket-Traum",
        `${wish.by} hat "${wish.text}" auf die Bucket-List gesetzt.`,
        "bucket-new"
      );
    } else if (wish.isBucket === false && wish.status === "done") {
      await sendToUser(
        partner,
        "🏆 Neuer Meilenstein",
        `${wish.by} hat "${wish.text}" nachgetragen.`,
        "milestone-new"
      );
    }
    // reine Date-Ideen (ohne isBucket/status) bleiben bewusst still — zu häufig für eine Notification
  }
);

// Bestehender Bucket-Traum wird abgehakt
exports.onBucketItemDone = onValueUpdated(
  { ref: "/wishes/{wishId}/status", region: REGION },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (after !== "done" || before === "done") return;

    const wishId = event.params.wishId;
    const db = getDatabase();
    const wishSnap = await db.ref(`wishes/${wishId}`).get();
    const wish = wishSnap.val();
    if (!wish || !wish.isBucket || !wish.by) return;

    const partner = otherUser(wish.by);
    await sendToUser(
      partner,
      "✨ Bucket-Traum erledigt",
      `"${wish.text || "Ein Traum"}" wurde abgehakt!`,
      "bucket-done"
    );
  }
);

// Quiz-Herausforderung gestartet
exports.onQuizCreated = onValueCreated(
  { ref: "/quiz/{quizId}", region: REGION },
  async (event) => {
    const quiz = event.data.val();
    if (!quiz || !quiz.by || !quiz.q) return;

    const partner = otherUser(quiz.by);
    await sendToUser(
      partner,
      `🎯 ${quiz.by} fordert dich zum Quiz heraus`,
      truncate(quiz.q, 100),
      "quiz-challenge"
    );
  }
);

// Quiz beantwortet -> Ersteller bekommt Rückmeldung
exports.onQuizAnswered = onValueUpdated(
  { ref: "/quiz/{quizId}/status", region: REGION },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (after !== "answered" || before === "answered") return;

    const quizId = event.params.quizId;
    const db = getDatabase();
    const quizSnap = await db.ref(`quiz/${quizId}`).get();
    const quiz = quizSnap.val();
    if (!quiz || !quiz.by || !quiz.answerBy) return;

    await sendToUser(
      quiz.by,
      `🎯 ${quiz.answerBy} hat geantwortet`,
      `Dein Quiz "${truncate(quiz.q || "", 60)}" wurde beantwortet.`,
      "quiz-answered"
    );
  }
);

// ============================================================
// PHASE 2 — Zeitgesteuert (läuft einmal täglich, bewusst dezent)
// ============================================================

exports.dailyDigest = onSchedule(
  { schedule: "every day 09:00", timeZone: TIMEZONE, region: REGION },
  async () => {
    const db = getDatabase();
    const now = new Date();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();
    const todayYear = now.getFullYear();

    // --- "On this day": abgeschlossene Meilensteine an einem früheren Jahrestag ---
    const wishesSnap = await db.ref("wishes").get();
    const wishes = wishesSnap.val() || {};
    for (const id of Object.keys(wishes)) {
      const w = wishes[id];
      if (!w || !w.doneAt || !w.text) continue;
      const d = new Date(w.doneAt);
      if (d.getMonth() !== todayMonth || d.getDate() !== todayDate) continue;
      const yearsAgo = todayYear - d.getFullYear();
      if (yearsAgo <= 0) continue;

      const label = yearsAgo === 1 ? "vor einem Jahr" : `vor ${yearsAgo} Jahren`;
      await sendToBoth(
        "📅 Erinnerung",
        `${label}: "${w.text}" ❤️`,
        "on-this-day"
      );
    }

    // --- Countdown, der morgen fällig ist ---
    const countdownSnap = await db.ref("countdown/current").get();
    const countdown = countdownSnap.val();
    if (countdown && countdown.target && countdown.title) {
      const target = new Date(countdown.target);
      const isTomorrow =
        target.getFullYear() === now.getFullYear() &&
        target.getMonth() === now.getMonth() &&
        target.getDate() === now.getDate() + 1;

      if (isTomorrow) {
        await sendToBoth(
          "⏰ Morgen ist es soweit",
          `"${countdown.title}" ❤️`,
          "countdown-soon"
        );
      }
    }
  }
);
