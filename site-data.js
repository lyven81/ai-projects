// Shared data for the ai-projects homepage and problem-type pages (preview).
// One entry per published project; the page is written per rules/project-showcase.md.
// `page` is "{slug}.html"; covers sit under images/{slug}/.
window.SITE = {
  whatsapp: "https://wa.me/60149207099",
  website: "https://lyven81.github.io/",
  linkedin: "https://www.linkedin.com/in/lee-yih-ven/",
  types: [
    { id: "customer-service", name: "Customer service",
      intro: "Assistants that answer customers from a business's own information. They take requests for staff to confirm and hand over what only a person should answer.",
      common: ["Answers only from approved information.", "Requests wait for staff before they count.", "Clear handover with a reason and a summary."] },
    { id: "document-processing", name: "Document processing",
      intro: "Systems that read invoices, claims and forms and pull out the fields a team needs. Every extraction is checked, and unclear cases go to a person.",
      common: ["Structured output checked against a schema.", "Missing or unclear fields flagged, never guessed.", "A person reviews what the checks cannot settle."] },
    { id: "research-and-reporting", name: "Research and reporting",
      intro: "Systems that gather information from several sources and turn it into a report. Every finding keeps a link to where it came from.",
      common: ["Work split across focused agents.", "Every claim traced to its source.", "Gaps and conflicts reported, not hidden."] },
    { id: "triage-and-routing", name: "Triage and routing",
      intro: "Systems that read incoming requests, classify them and send each to the right person or queue. Clear rules decide what goes to a person first.",
      common: ["Explicit criteria for each route.", "Uncertain cases sent to a person.", "Every routing decision recorded."] },
  ],
  projects: [
    { slug: "wee-auto-car-care", title: "Wee Auto Car Care", type: "customer-service",
      valueProposition: "Customer Experience", added: "2026-10-16",
      tagline: "A customer service assistant for a car workshop, with staff in control.",
      problem: "A car workshop gets the same customer questions all day: prices, free slots and car status. The owner checks the booking dashboard for every answer. One customer must never see another customer's booking.",
      page: "wee-auto-car-care.html",
      cover: "images/wee-auto-car-care/cover.jpeg",
      demo: "https://lyven81.github.io/ai-projects/projects/wee-auto-car-care/assistant.html" },
  ],
};
