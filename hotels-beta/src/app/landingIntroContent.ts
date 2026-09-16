/* The wording of the landing page's introduction panel (LandingIntro.tsx), kept
 * apart from the layout so it can be edited without touching it. Paragraphs
 * render in order. */
export const LANDING_INTRO = {
  tagline: "Concierge meets travel booking",
  paragraphs: [
    "myOLTRA brings together the world's finest hotels and restaurants, and the flights to reach them. We then wrap it into an appealing and intuitive user interface and add an interactive AI Concierge layer.",
    "Our collection of around 800 hotels is selected by our team and informed by respected authorities such as Forbes Travel Guide, the MICHELIN Guide, Condé Nast Traveler and The World's 50 Best Hotels. Our restaurants are selected the same way, drawing on sources such as the MICHELIN Guide, Gault&Millau, The World's 50 Best Restaurants and La Liste.",
    "We have also built a new way to search and book flights, designed to be simple and intuitive. It will enable you to find the most convenient flight with your favorite airlines in a matter of seconds.",
    "Membership is free. It gives you full access to our AI Concierge, trip planning tools and other member benefits.",
    "We have only just started. New partners, inventory, services and improvements will follow, shaped in part by your suggestions and feedback.",
  ],
  closing: "Our success is the memories you treasure",
  ctaLabel: "Become a member",
  ctaHref: "/login?view=signup",
} as const;
