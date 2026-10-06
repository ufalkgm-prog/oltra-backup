/* The wording of the landing page's welcome letter (LandingIntro.tsx), kept
 * apart from the layout so it can be edited without touching it. Paragraphs
 * render in order; a `label` leads its paragraph ("Hotels – ..."). */
export const LANDING_INTRO = {
  tagline: "Curated travel planning redefined",
  paragraphs: [
    {
      text: "myOLTRA was born from a vision of creating one single platform for discovering and booking the very best hotels and restaurants in the world and offer easy flight booking, high-quality concierge services and intuitive travel planning tools.",
    },
    {
      label: "Hotels",
      text: "Our collection currently includes around 850 of the world’s very best hotels. Each hotel has been reviewed and selected by our team, informed in part by the most recognized guides and rankings.",
    },
    {
      label: "Restaurants",
      text: "Our restaurant collection includes around 2,500 restaurants in around 70 typical travel destinations around the world, all selected using external sources as curation input. They range from some of the world’s most celebrated dining rooms to more relaxed bistros and beach clubs to cater to all occasions and moods.",
    },
    {
      label: "Flights",
      text: "We have redefined flight search and selection and offer a simple and intuitive tool to find the best connections to get you to where you are going. It’s simple, easy to use and gives you the information you need to make the best choice.",
    },
    {
      label: "Membership",
      text: "Membership is all about offering additional valuable travel planning tools, which we would like you to use again and again. It’s free and not designed to push ads or promotions, only to improve your overall travel planning experience.",
    },
    {
      label: "AI Concierge",
      text: "Our AI Concierge is a truly novel concierge format trained by us to assist you with all aspects of your trip including assisting and refining searches within myOLTRA, aligning with relevant leisure interests, and answering essentially any destination or travel related question, and pairing it with your travel itinerary.",
    },
    {
      text: "Bookings are currently completed through one of our partners or directly with the hotel or restaurant. This means that the final booking and payment will be confirmed and managed by them. These are all highly accredited partners that we trust.",
    },
    {
      text: "myOLTRA has only just launched. A mobile app, more content, categories and a growing selection of hotels and restaurants will follow. We will also continue to increase our integration with partners to offer you an increasingly seamless and direct booking experience.",
    },
    {
      text: "We hope you will enjoy using myOLTRA and return whenever you are looking for inspiration for your next trip. We also urge you to give us feedback on content and functionality as you go using the members feedback feature.",
    },
  ] as { label?: string; text: string }[],
  closing: "Thank you for visiting myOLTRA – we hope you return",
  ctaLabel: "Become a member",
  ctaHref: "/login?view=signup",
} as const;
