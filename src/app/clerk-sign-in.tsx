"use client";

import dynamic from "next/dynamic";

const ClerkSignIn = dynamic(
  () => import("@clerk/nextjs").then((module) => module.SignIn),
  { ssr: false },
);

export default ClerkSignIn;
