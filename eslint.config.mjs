import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextCoreWebVitals,
  {
    ignores: ["supabase/**"],
  },
  {
    rules: {
      // This rule was introduced by the React 19 lint plugin. Keeping it off
      // preserves the existing effect-driven UI behavior during this security upgrade.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
