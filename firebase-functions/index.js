const { onValueCreated } = require("firebase-functions/v2/database");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const REGION = "europe-west1";

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

exports.onLoveLetterCreated = onValueCreated(
  { ref: "/loveLetters/{pushId}", region: REGION },
  async (event) => {
    const letter = event.data.val();
    if (!letter || !letter.by || !letter.text) return;

    const partner = letter.by === "Samet" ? "Meriam" : "Samet";
    const preview =
      letter.text.length > 100 ? letter.text.slice(0, 97) + "..." : letter.text;

    await sendToUser(partner, `💌 Neue Nachricht von ${letter.by}`, preview, "love-letter");
  }
);
