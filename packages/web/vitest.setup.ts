import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest has no globals here, so Testing Library cannot register its own cleanup: without this every render stays in
// the document for the next test.
afterEach(cleanup);
