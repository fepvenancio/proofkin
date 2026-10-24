"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { currentSection, type Section } from "@/config/routes";

const ITEMS: { section: Section; label: string; href: string }[] = [
  { section: "puzzles", label: "Puzzles", href: "/" },
  { section: "gallery", label: "Gallery", href: "/gallery" },
];

/**
 * @notice The main navigation, saying which section the visitor is in.
 * @dev A client component only because the current path is known in the browser's router; it is a leaf, so the header
 * around it stays on the server.
 */
export function NavLinks() {
  const current = currentSection(usePathname());
  return (
    <nav aria-label="Main" className="flex gap-6">
      {ITEMS.map(({ section, label, href }) => (
        <Link
          key={section}
          href={href}
          aria-current={section === current ? "page" : undefined}
          className="underline-offset-8 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline aria-[current=page]:decoration-2"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
