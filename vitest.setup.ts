import { config } from "dotenv";

config({ path: ".env.test", override: true });

import "@testing-library/jest-dom/vitest";
