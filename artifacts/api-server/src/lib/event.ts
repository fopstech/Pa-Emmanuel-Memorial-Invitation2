export const memorialEvent = {
  name: "Pa Emmanuel Ayodele Abatan",
  title: "A Celebration of Life",
  wakeKeep: {
    label: "Wake Keep",
    date: "October 15, 2026",
    time: "4:00 PM",
    isoStart: "2026-10-15T16:00:00+01:00",
    isoEnd: "2026-10-15T20:00:00+01:00",
    venue: "CGCC Citadel Global Community Church",
    directionsUrl:
      "https://www.google.com/maps/search/?api=1&query=CGCC+Citadel+Global+Community+Church",
  },
  burial: {
    label: "Burial",
    date: "October 16, 2026",
    time: "2:00 PM",
    isoStart: "2026-10-16T14:00:00+01:00",
    isoEnd: "2026-10-16T18:00:00+01:00",
    venue: "Ronnie D Event / Ronnie D'Events",
    directionsUrl:
      "https://www.google.com/maps/search/?api=1&query=Ronnie+D+Events",
  },
  dressCode: "Purple",
  photos: ["/memorial-main.jpg", "/memorial-gallery.jpg"],
} as const;

export type MemorialEvent = typeof memorialEvent;

export function invitationUrl(token: string, request?: { protocol: string; get: (name: string) => string | undefined }) {
  if (!request) return `/invite/${token}`;
  const forwardedProto = request.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.protocol;
  const host = request.get("host");
  return host ? `${protocol}://${host}/invite/${token}` : `/invite/${token}`;
}