const { onValueCreated, onValueUpdated } = require("firebase-functions/v2/database");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const REGION = "europe-west1";

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

// --- 1) Love-Letter / Post-it ---
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

// --- 2) Milestone-Kommentar ---
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

// --- 3) Neues Foto/Memory hochgeladen ---
exports.onMemoryPhotoAdded = onValueUpdated(
  { ref: "/wishes/{wishId}/memoryPhotos", region: REGION },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const beforeLen = Array.isArray(before) ? before.length : 0;
    const afterLen = Array.isArray(after) ? after.length : 0;
    if (afterLen <= beforeLen) return;

    const wishId = event.params.wishId;
    const db = getDatabase();
    const wishSnap = await db.ref(`wishes/${wishId}`).get();
    const wish = wishSnap.val();
    if (!wish || !wish.by) return;

    const partner = otherUser(wish.by);
    await sendToUser(
      partner,
      "📸 Neues Foto hinzugefügt",
      `Bei "${wish.text || "eurem Moment"}" ist ein neues Foto aufgetaucht.`,
      "memory-photo"
    );
  }
);

// --- 4) Bucket-List-Punkt erledigt ---
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

// --- 5) Quiz-Herausforderung gestartet ---
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
