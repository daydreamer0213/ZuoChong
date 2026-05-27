export const MAX_MESSAGE_LENGTH = 140;
const UNSAFE_MESSAGE_PATTERN = /```|<script|function\s+\w+|=>|\b(class|import|export|const|let|var)\b|https?:\/\/|www\.|\/[\w.-]+\/[\w./-]+|[A-Za-z]:\\|api[_-]?key|secret|token|password|passwd|BEGIN [A-Z ]+PRIVATE KEY/i;

export const ACTIONS = {
  hello: [{ message: "Hello. I am happy to see you.", reaction: "waving" }, { message: "Tiny wave from your pet.", reaction: "waving" }],
  company: [{ message: "I will keep you company.", reaction: "waving" }, { message: "Still here with you.", reaction: "waving" }],
  cheer: [{ message: "You got this.", reaction: "success" }, { message: "I am rooting for you.", reaction: "celebrating" }],
  trick: [{ message: "Tiny trick complete.", reaction: "celebrating" }, { message: "Ta-da.", reaction: "success" }],
  celebrate: [{ message: "Tiny celebration!", reaction: "celebrating" }, { message: "That deserves a happy wiggle.", reaction: "celebrating" }],
  calm: [{ message: "Deep breath. Nice and easy.", reaction: "waiting" }, { message: "Slow blink. You are safe.", reaction: "waiting" }],
  random: [{ message: "I believe in snack breaks.", reaction: "waving" }, { message: "Soft paws, brave heart.", reaction: "success" }],
};

export function safeText(value, fallback = "Hello.") {
  const text = typeof value === "string" && value.trim() ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ") : fallback;
  const capped = text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH).trim() : text;
  return !capped || UNSAFE_MESSAGE_PATTERN.test(capped) ? fallback : capped;
}

export function pick(list, random = Math.random) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

export async function runAction(ctx, key, random = Math.random) {
  const item = pick(ACTIONS[key] || ACTIONS.random, random);
  await ctx.pet.speak(safeText(item.message));
  await ctx.pet.react(item.reaction);
  return item;
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await ctx.status.set({ text: "Ready for playful pet actions", tone: "info" });
      await ctx.commands.register({ id: "say-hello", title: "Say hello", description: "Get a friendly greeting." }, () => runAction(ctx, "hello"));
      await ctx.commands.register({ id: "keep-me-company", title: "Keep me company", description: "Ask your pet to stay nearby." }, () => runAction(ctx, "company"));
      await ctx.commands.register({ id: "cheer-me-up", title: "Cheer me up", description: "Ask your pet for a tiny cheer." }, () => runAction(ctx, "cheer"));
      await ctx.commands.register({ id: "do-a-trick", title: "Do a trick", description: "Ask your pet for a tiny trick." }, () => runAction(ctx, "trick"));
      await ctx.commands.register({ id: "celebrate", title: "Celebrate", description: "Celebrate a little win." }, () => runAction(ctx, "celebrate"));
      await ctx.commands.register({ id: "calm-down", title: "Calm down", description: "Hear a calm little cue." }, () => runAction(ctx, "calm"));
      await ctx.commands.register({ id: "random-mood", title: "Random mood", description: "Let your pet choose a mood." }, () => runAction(ctx, "random"));
    },
    async stop() {}
  });
}
