// The same task goes to both agents, so the only difference on screen is the SDK wrapper.
// Pass a URL as the first argument to point both agents at a different reviews page.
const DEFAULT_URL = "https://www.g2.com/products/postman/reviews";

export const TARGET_URL = process.argv[2] ?? DEFAULT_URL;

export const PROMPT = `Go to ${TARGET_URL} and return the 10 most recent reviews as JSON with reviewer, rating, date and title. Only use what is on the page. If a field is missing, use null.`;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}
