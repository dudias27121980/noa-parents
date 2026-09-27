import { Building2, Clock, FileText, Map, Siren, Users, type LucideIcon } from 'lucide-react';
import { ViewScreen } from '../types/tactical';

export const SCREENS: { id: ViewScreen; label: string; icon: LucideIcon }[] = [
  { id: 'clock', label: 'שעון מבצעי', icon: Clock },
  { id: 'map', label: 'מפה טקטית', icon: Map },
  { id: 'incidents', label: 'אירועים', icon: Siren },
  { id: 'forces', label: 'כוחות', icon: Users },
  { id: 'agencies', label: 'כוחות חבירים', icon: Building2 },
  { id: 'log', label: 'יומן מבצעים', icon: FileText },
];
