/** Static tournament metadata — IDs, display names, accent colours, logos only.
 *  All live data (player seeds, start dates) is fetched from Gemini at runtime. */
export type TournamentMeta = {
  id: string;
  name: string;
  color: string;
  logo: string;
};

export const tournaments: TournamentMeta[] = [
  { id: 'ao',  name: 'Australian Open', color: 'bg-blue-500',   logo: '/logos/Australian-Open-Logo-360x225.svg' },
  { id: 'rg',  name: 'French Open',     color: 'bg-orange-600', logo: '/logos/Roland-Garros-Logo-1536x960.svg'  },
  { id: 'wim', name: 'Wimbledon',        color: 'bg-green-700',  logo: '/logos/Wimbledon-Logo.svg'               },
  { id: 'uso', name: 'US Open',          color: 'bg-blue-700',   logo: '/logos/US-Open-logo.svg'                 },
];
