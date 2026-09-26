import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';
import AddressBookModal from '@/components/AddressBookModal';
import ProfileEditorModal from '@/components/ProfileEditorModal';
import CreateOpportunityModal from '@/components/CreateOpportunityModal';
import AdminVerificationQueueModal from '@/components/AdminVerificationQueueModal';
import PayoutSettingsModal from '@/components/PayoutSettingsModal';
import AvailabilityModal from '@/components/AvailabilityModal';
import SupportModal from '@/components/SupportModal';
import NotificationsModal from '@/components/NotificationsModal';
import JobProposalModal from '@/components/JobProposalModal';
import AdminPaymentTransfersModal from '@/components/AdminPaymentTransfersModal';
import GuildsModal from '@/components/GuildsModal';
import SecuritySessionsModal from '@/components/SecuritySessionsModal';
import PaymentHistoryModal from '@/components/PaymentHistoryModal';
import BusinessTeamModal from '@/components/BusinessTeamModal';

type Role = 'customer' | 'artisan' | 'professional' | 'business' | 'admin';
type Tab = 'dashboard' | 'work' | 'chat' | 'network' | 'profile';
type Screen = Tab;
type IconName = React.ComponentProps<typeof Feather>['name'];

type ThemeMode = 'dark' | 'light';
type Palette = typeof colors.dark;

function createTheme(activePalette: Palette) {
  return {
    activePalette,
    lime: activePalette.primary,
    accentText: activePalette.tint,
    onPrimary: activePalette.primaryForeground,
    ink: activePalette.background,
    panel: activePalette.card,
    panelSoft: activePalette.secondary,
    text: activePalette.foreground,
    muted: activePalette.mutedForeground,
    styles: createStyles(activePalette),
  };
}

const AppThemeContext = createContext<ReturnType<typeof createTheme> | null>(null);
function useAppTheme() {
  const theme = useContext(AppThemeContext);
  if (!theme) throw new Error('App theme provider is missing');
  return theme;
}

const roleConfig: Record<Role, {
  label: string;
  icon: IconName;
  tabs: { id: Tab; label: string; icon: IconName }[];
}> = {
  customer: {
    label: 'Customer',
    icon: 'user',
    tabs: [
      { id: 'dashboard', label: 'Find providers', icon: 'home' },
      { id: 'work', label: 'My Jobs', icon: 'briefcase' },
      { id: 'chat', label: 'Chat', icon: 'message-circle' },
      { id: 'network', label: 'Saved', icon: 'bookmark' },
      { id: 'profile', label: 'Profile', icon: 'user' },
    ],
  },
  artisan: {
    label: 'Artisan',
    icon: 'tool',
    tabs: [
      { id: 'dashboard', label: 'Today', icon: 'sun' },
      { id: 'work', label: 'Open jobs', icon: 'briefcase' },
      { id: 'chat', label: 'Chat', icon: 'message-circle' },
      { id: 'network', label: 'Network', icon: 'users' },
      { id: 'profile', label: 'Profile', icon: 'user' },
    ],
  },
  professional: {
    label: 'Professional',
    icon: 'award',
    tabs: [
      { id: 'dashboard', label: 'Client Desk', icon: 'home' },
      { id: 'work', label: 'Open jobs', icon: 'file-text' },
      { id: 'chat', label: 'Chat', icon: 'message-circle' },
      { id: 'network', label: 'Pro Network', icon: 'users' },
      { id: 'profile', label: 'Profile', icon: 'user' },
    ],
  },
  business: {
    label: 'Business',
    icon: 'briefcase',
    tabs: [
      { id: 'dashboard', label: 'Business Ops', icon: 'home' },
      { id: 'work', label: 'My Jobs', icon: 'briefcase' },
      { id: 'chat', label: 'Chat', icon: 'message-circle' },
      { id: 'network', label: 'Vendors', icon: 'users' },
      { id: 'profile', label: 'Profile', icon: 'user' },
    ],
  },
  admin: {
    label: 'Admin',
    icon: 'shield',
    tabs: [
      { id: 'dashboard', label: 'Overview', icon: 'home' },
      { id: 'work', label: 'Jobs', icon: 'briefcase' },
      { id: 'chat', label: 'Messages', icon: 'message-circle' },
      { id: 'network', label: 'Audit Logs', icon: 'activity' },
      { id: 'profile', label: 'Settings', icon: 'settings' },
    ],
  },
};

const roles: Role[] = ['customer', 'artisan', 'professional', 'business', 'admin'];

function IconButton({ icon, onPress, active = false, size = 18 }: {
  icon: IconName;
  onPress?: () => void;
  active?: boolean;
  size?: number;
}) {
  const { onPrimary, text, styles } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, active && styles.iconButtonActive, pressed && styles.pressed]}
    >
        <Feather name={icon} size={size} color={active ? onPrimary : text} />
    </Pressable>
  );
}


function ActionModal({ visible, title, message, onClose }: {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  const { styles } = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.actionModal}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { styles } = useAppTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Pressable onPress={onAction} hitSlop={10}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}
    </View>
  );
}

function AppHeader({ role, onRolePicker, onNotifications }: { role: Role; onRolePicker: () => void; onNotifications: () => void }) {
  const { accentText, onPrimary, styles } = useAppTheme();
  return (
    <View style={styles.header}>
      <View>
        <View style={styles.locationRow}>
          <Feather name="map-pin" size={12} color={accentText} />
          <Text style={styles.locationText}>Lagos, Nigeria</Text>
        </View>
        <Text style={styles.brandMark}>handy<Text style={styles.brandAccent}>skillz</Text></Text>
      </View>
      <View style={styles.headerActions}>
        <IconButton icon="bell" onPress={onNotifications} />
        <Pressable onPress={onRolePicker} style={({ pressed }) => [styles.roleBadge, pressed && styles.pressed]}>
          <Feather name={roleConfig[role].icon} size={16} color={onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

function SearchBar({ placeholder, value, onChangeText, onFilter }: { placeholder: string; value?: string; onChangeText?: (value: string) => void; onFilter?: () => void }) {
  const { text, muted, styles } = useAppTheme();
  return (
    <View style={styles.searchBar}>
      <Feather name="search" size={18} color={text} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={muted}
        style={styles.searchInput}
      />
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onFilter} style={({ pressed }) => pressed && styles.pressed}>
        <Feather name="sliders" size={17} color={muted} />
      </Pressable>
    </View>
  );
}

function RolePicker({ role, canAccessAdmin, onSelect, onClose }: { role: Role; canAccessAdmin: boolean; onSelect: (role: Role) => void; onClose: () => void }) {
  const { accentText, onPrimary, styles } = useAppTheme();
  return (
    <View style={styles.rolePicker}>
      <View style={styles.pickerHeader}>
        <View>
          <Text style={styles.pickerTitle}>Switch workspace</Text>
          <Text style={styles.pickerSubtitle}>Changes your account role and marketplace access</Text>
        </View>
        <IconButton icon="x" onPress={onClose} />
      </View>
      {roles.filter((item) => item !== 'admin' || canAccessAdmin).map((item) => {
        const active = item === role;
        return (
          <Pressable
            key={item}
            onPress={() => onSelect(item)}
            style={({ pressed }) => [styles.roleOption, active && styles.roleOptionActive, pressed && styles.pressed]}
          >
            <View style={[styles.roleIcon, active && styles.roleIconActive]}>
              <Feather name={roleConfig[item].icon} size={16} color={active ? onPrimary : accentText} />
            </View>
            <Text style={[styles.roleOptionText, active && styles.roleOptionTextActive]}>{roleConfig[item].label} mode</Text>
            {active ? <Feather name="check" size={17} color={onPrimary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function BottomNav({ role, tab, onChange }: { role: Role; tab: Tab; onChange: (tab: Tab) => void }) {
  const { accentText, muted, styles } = useAppTheme();
  return (
    <View style={styles.bottomNav}>
      {roleConfig[role].tabs.map((item) => {
        const active = tab === item.id;
        return (
          <Pressable
            key={item.id}
            testID={`tab-${item.id}`}
            accessibilityRole="button"
            onPress={() => {
              Haptics.selectionAsync();
              onChange(item.id);
            }}
            style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}
          >
            <Feather name={item.icon} size={17} color={active ? accentText : muted} />
            <Text numberOfLines={1} style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type MatchRecord = { id: string; name: string; skill: string; jobsCompleted: number; location: string; price: string; icon: IconName; tone: string };

function MatchCard({ match, onPress }: { match: MatchRecord; onPress: () => void }) {
  const { muted, styles } = useAppTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matchCard, pressed && styles.pressed]}>
      <View style={[styles.matchAvatar, { backgroundColor: match.tone }]}>
        <Text style={styles.matchInitial}>{match.name.charAt(0)}</Text>
      </View>
      <View style={styles.matchCopy}>
        <View style={styles.matchNameRow}>
          <Text style={styles.matchName}>{match.name}</Text>
          <Text style={styles.matchPrice}>{match.price}</Text>
        </View>
        <Text style={styles.matchSkill}>{match.skill}</Text>
        <View style={styles.matchMeta}>
          <Text style={styles.metaAccent}>{match.jobsCompleted ? `${match.jobsCompleted} jobs completed` : 'New provider'}</Text>
          <Text style={styles.metaText}>{match.location}</Text>
        </View>
      </View>
      <Feather name="chevron-right" size={17} color={muted} />
    </Pressable>
  );
}

function CustomerDashboard({ onAction }: { onAction: (title: string, message: string) => void }) {
  const { onPrimary, styles } = useAppTheme();
  const { getToken } = useAuth();
  const [request, setRequest] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const findMatches = async (query = request) => {
    if (!query.trim()) { onAction('Describe your task', 'Enter a service or task above to search provider profiles.'); return; }
    setSubmitted(true);
    setLoadingMatches(true);
    try {
      if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to search real provider profiles.');
      const token = await getToken();
      if (!token) throw new Error('Sign in again to search providers.');
      const response = await fetch(`${apiBase}/api/network/providers`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Provider search failed.');
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const providers = (Array.isArray(payload.providers) ? payload.providers : []).filter((provider: any) => {
        const searchable = [provider.display_name, provider.city, provider.bio, ...(provider.skills || [])].join(' ').toLowerCase();
        return terms.some((term: string) => searchable.includes(term));
      });
      setMatches(providers.map((provider: any, index: number) => ({
        id: provider.id,
        name: provider.display_name,
        skill: (provider.skills || []).join(', ') || provider.role,
        jobsCompleted: Number(provider.completed_jobs) || 0,
        location: provider.city || 'Location not set',
        price: Number(provider.hourly_rate_ngn) > 0 ? `₦${Number(provider.hourly_rate_ngn).toLocaleString()} / hr` : 'Request quote',
        icon: 'tool' as IconName,
        tone: ['#cf9e79', '#9abca6', '#b7a1cf'][index % 3],
      })));
    } catch (searchError) {
      onAction('Provider search', searchError instanceof Error ? searchError.message : 'Could not search providers.');
      setMatches([]);
    } finally { setLoadingMatches(false); }
  };
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
      <View style={styles.greetingRow}>
        <View><Text style={styles.eyebrow}>Handyskillz</Text><Text style={styles.greeting}>Find your next expert</Text></View>
      <View style={styles.avatar}><Feather name="user" size={19} color="#302019" /></View>
      </View>
      <SearchBar value={request} onChangeText={setRequest} placeholder="What do you need help with?" onFilter={() => setShowFilters((value) => !value)} />
      {showFilters ? <View style={styles.chipRow}>{['artisan', 'professional', 'business'].map((category) => <Pressable key={category} onPress={() => { setRequest(category); setShowFilters(false); void findMatches(category); }} style={styles.skillChip}><Text style={styles.skillChipText}>{category}</Text></Pressable>)}</View> : null}
      <Pressable onPress={() => void findMatches()} style={({ pressed }) => [styles.aiCard, pressed && styles.pressed]}>
        <View style={styles.aiIcon}><Feather name="star" size={17} color={onPrimary} /></View>
        <View style={styles.aiCopy}><Text style={styles.aiTitle}>Find a skilled provider</Text><Text style={styles.aiText}>Search real provider profiles by skill, name or location.</Text></View>
        <Feather name="arrow-up-right" size={18} color={onPrimary} />
      </Pressable>
      <View style={styles.chipRow}>
        {['Plumbing', 'Electrical', 'Design'].map((chip, index) => (
          <Pressable key={chip} onPress={() => setRequest(chip)} style={({ pressed }) => [styles.skillChip, index === 0 && styles.skillChipActive, pressed && styles.pressed]}>
            <Text style={[styles.skillChipText, index === 0 && styles.skillChipTextActive]}>{chip}</Text>
          </Pressable>
        ))}
      </View>
      <SectionHeader title={submitted ? 'Top matches for your request' : 'Search provider profiles'} />
      {loadingMatches ? <Text style={styles.communityRowMeta}>Searching provider profiles…</Text> : null}
      {matches.map((match) => <MatchCard key={match.id} match={match} onPress={() => onAction(match.name, `${match.skill}\n${match.location} · ${match.price} · ${match.jobsCompleted} completed jobs`)} />)}
      {submitted && !loadingMatches && matches.length === 0 ? <Text style={styles.communityRowMeta}>No providers matched that search. Try another skill or location.</Text> : null}
      <Pressable onPress={() => void findMatches()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Feather name="search" size={17} color={onPrimary} />
        <Text style={styles.primaryButtonText}>{submitted ? 'Refresh search' : 'Search providers'}</Text>
      </Pressable>
      <View style={styles.spacer} />
    </ScrollView>
  );
}

function ProviderDashboard({ role, onOpenJob, onCreateOpportunity, onSeeAll, onReviewQueue }: { role: Exclude<Role, 'customer'>; onOpenJob: (job: any) => void; onCreateOpportunity: () => void; onSeeAll: () => void; onReviewQueue: () => void }) {
  const { lime, accentText, onPrimary, muted, styles } = useAppTheme();
  const { getToken } = useAuth();
  const config = roleConfig[role];
  const isAdmin = role === 'admin';
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [adminOverview, setAdminOverview] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [loadError, setLoadError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const loadOpportunities = async () => {
    if (!apiBase) { setLoadError('Set EXPO_PUBLIC_API_URL to load live opportunities.'); return; }
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in again to load opportunities.');
      if (isAdmin) {
        const response = await fetch(`${apiBase}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Admin metrics could not be loaded.');
        setAdminOverview(payload);
        setLoadError('');
        return;
      }
      const response = await fetch(`${apiBase}/api/jobs?role=${encodeURIComponent(role)}&status=open&search=${encodeURIComponent(search)}&location=${encodeURIComponent(locationFilter)}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load opportunities.');
      setOpportunities(Array.isArray(payload.jobs) ? payload.jobs : []);
      setLoadError('');
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Could not load opportunities.'); }
  };
  useEffect(() => { void loadOpportunities(); }, [role, search, locationFilter]);
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
      <View style={styles.greetingRow}>
        <View><Text style={styles.eyebrow}>{isAdmin ? 'Platform overview' : config.label}</Text><Text style={styles.greeting}>{isAdmin ? 'Platform Overview' : 'Find opportunities'}</Text></View>
        <View style={[styles.avatar, { backgroundColor: isAdmin ? lime : '#9abca6' }]}><Feather name={config.icon} size={20} color={isAdmin ? onPrimary : '#173b30'} /></View>
      </View>
      {!isAdmin ? <SearchBar value={search} onChangeText={setSearch} placeholder="Search opportunities..." onFilter={() => setShowFilters((value) => !value)} /> : null}
      {showFilters && !isAdmin ? <View style={styles.chipRow}>{['All', 'Lagos', 'Remote'].map((filter) => <Pressable key={filter} onPress={() => { setLocationFilter(filter === 'All' ? '' : filter); setShowFilters(false); }} style={styles.skillChip}><Text style={styles.skillChipText}>{filter}</Text></Pressable>)}</View> : null}
      <View style={styles.metricRow}>
        <View style={styles.metricCard}><Text style={styles.metricLabel}>{isAdmin ? 'Registered profiles' : 'Open opportunities'}</Text><Text style={styles.metricValue}>{isAdmin ? (adminOverview?.registeredProfiles ?? '—') : opportunities.length}</Text><Text style={styles.metricDelta}>{isAdmin ? `${adminOverview?.pendingVerifications ?? '—'} pending verifications` : 'Matching your search'}</Text></View>
        <View style={styles.metricCard}><Text style={styles.metricLabel}>{isAdmin ? 'Open jobs' : 'Search location'}</Text><Text style={[styles.metricValue, !isAdmin && styles.metricLabel]}>{isAdmin ? (adminOverview?.openJobs ?? '—') : locationFilter || 'All areas'}</Text><Text style={styles.metricDelta}>{isAdmin ? 'Current platform count' : 'Current opportunity filter'}</Text></View>
      </View>
      {!isAdmin ? <SectionHeader title="Nearby opportunities" action="See All" onAction={onSeeAll} /> : null}
      {opportunities.map((job) => (
        <Pressable key={job.id} onPress={() => onOpenJob(job)} style={({ pressed }) => [styles.leadCard, pressed && styles.pressed]}>
          <View style={styles.leadIcon}><Feather name="briefcase" size={17} color={accentText} /></View>
          <View style={styles.leadCopy}><Text style={styles.leadTitle}>{job.title}</Text><Text style={styles.leadMeta}>{job.location || 'Remote'} · {job.category}</Text></View>
          <View style={styles.leadRight}><Text style={styles.leadBudget}>{job.budget_max_ngn ? `₦${Number(job.budget_max_ngn).toLocaleString()}` : 'Quote'}</Text><Feather name="chevron-right" size={16} color={muted} /></View>
        </Pressable>
      ))}
      {!isAdmin && opportunities.length === 0 && !loadError ? <Text style={styles.communityRowMeta}>No open opportunities matched that search.</Text> : null}
      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
      <Pressable onPress={() => { if (isAdmin) onReviewQueue(); else if (role === 'business') onCreateOpportunity(); else onSeeAll(); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Feather name={isAdmin ? 'check-square' : 'plus'} size={17} color={onPrimary} />
        <Text style={styles.primaryButtonText}>{isAdmin ? 'Review verification queue' : role === 'business' ? 'Post an opportunity' : 'Browse all opportunities'}</Text>
      </Pressable>
      <View style={styles.spacer} />
    </ScrollView>
  );
}

function WorkScreen({ role, onOpenJob }: { role: Role; onOpenJob: (job: any) => void }) {
  const { lime, muted, styles } = useAppTheme();
  const { getToken } = useAuth();
  const title = roleConfig[role].tabs.find((tab) => tab.id === 'work')?.label ?? 'My Work';
  const [status, setStatus] = useState('open');
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const loadJobs = async () => {
    if (!apiBase) { setError('Set EXPO_PUBLIC_API_URL to load live work.'); return; }
    setLoading(true); setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in again to load your work.');
      const query = new URLSearchParams({ role, status });
      const response = await fetch(`${apiBase}/api/jobs?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load work.');
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load work.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadJobs(); }, [role, status]);
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
      <View style={styles.simpleHeader}><Text style={styles.screenTitle}>{title}</Text><IconButton icon="refresh-cw" onPress={() => void loadJobs()} /></View>
      <View style={styles.tabPills}>{[['open', 'Open'], ['matched', 'Matched'], ['in_progress', 'In progress'], ['completed', 'Completed']].map(([value, label]) => <Pressable key={value} onPress={() => setStatus(value)}><Text style={status === value ? styles.activePill : styles.inactivePill}>{label}</Text></Pressable>)}</View>
      {loading ? <Text style={styles.communityRowMeta}>Loading work…</Text> : null}
      {jobs.map((job) => (
        <Pressable key={job.id} onPress={() => onOpenJob(job)} style={({ pressed }) => [styles.workCard, pressed && styles.pressed]}>
          <View style={styles.workIcon}><Feather name="briefcase" size={19} color={lime} /></View>
          <View style={styles.workCopy}><Text style={styles.workTitle}>{job.title}</Text><Text style={styles.workSubtitle}>{job.category} · {job.location || 'Remote'} · {job.status.replace('_', ' ')}</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: job.status === 'completed' ? '100%' : '30%' }]} /></View></View>
          <View style={styles.workAmount}><Text style={styles.workAmountText}>{job.budget_max_ngn ? `₦${Number(job.budget_max_ngn).toLocaleString()}` : 'Quote'}</Text><Feather name="chevron-right" size={16} color={muted} /></View>
        </Pressable>
      ))}
      {!loading && jobs.length === 0 && !error ? <Text style={styles.communityRowMeta}>No work found for this status.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.spacer} />
    </ScrollView>
  );
}

function NetworkScreen({ role, onAction, onStartConversation }: { role: Role; onAction: (title: string, message: string) => void; onStartConversation: (providerId: string) => void }) {
  const { lime, accentText, onPrimary, muted, styles } = useAppTheme();
  const { getToken } = useAuth();
  const title = roleConfig[role].tabs.find((tab) => tab.id === 'network')?.label ?? 'Network';
  const admin = role === 'admin';
  const [providers, setProviders] = useState<any[]>([]);
  const [adminEvents, setAdminEvents] = useState<any[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showSaved, setShowSaved] = useState(role === 'customer');
  const [networkError, setNetworkError] = useState('');
  const [loading, setLoading] = useState(false);
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';

  const loadProviders = async () => {
    if (!apiBase) { setNetworkError('Set EXPO_PUBLIC_API_URL to load provider profiles.'); return; }
    setLoading(true);
    setNetworkError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in again to load providers.');
      const path = admin ? '/admin/audit' : showSaved ? '/network/saved' : `/network/providers?search=${encodeURIComponent(search)}&role=${encodeURIComponent(role === 'customer' ? '' : role)}`;
      const response = await fetch(`${apiBase}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load providers.');
      if (admin) {
        const events = Array.isArray(payload.events) ? payload.events : [];
        setProviders([]);
        setAdminEvents(events.filter((event: any) => !search || `${event.action} ${event.entity_type}`.toLowerCase().includes(search.toLowerCase())));
        setNetworkError('');
        return;
      }
      const items = Array.isArray(payload.providers) ? payload.providers : [];
      setAdminEvents([]);
      setProviders(items);
      if (showSaved) setSavedIds(items.map((provider: any) => provider.id));
      else {
        const savedResponse = await fetch(`${apiBase}/api/network/saved`, { headers: { Authorization: `Bearer ${token}` } });
        const savedPayload = await savedResponse.json();
        if (savedResponse.ok && Array.isArray(savedPayload.providers)) setSavedIds(savedPayload.providers.map((provider: any) => provider.id));
      }
    } catch (loadError) {
      setNetworkError(loadError instanceof Error ? loadError.message : 'Could not load providers.');
    } finally { setLoading(false); }
  };

  useEffect(() => { setShowSaved(role === 'customer'); void loadProviders(); }, [role, showSaved, search]);

  const toggleSaved = async (providerId: string) => {
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in again to save providers.');
      const wasSaved = savedIds.includes(providerId);
      const response = await fetch(`${apiBase}/api/network/saved/${encodeURIComponent(providerId)}`, {
        method: wasSaved ? 'DELETE' : 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not update saved providers.');
      setSavedIds((current) => wasSaved ? current.filter((id) => id !== providerId) : [...current, providerId]);
      if (wasSaved && showSaved) setProviders((current) => current.filter((provider) => provider.id !== providerId));
    } catch (saveError) { setNetworkError(saveError instanceof Error ? saveError.message : 'Could not update saved providers.'); }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
      <View style={styles.simpleHeader}><Text style={styles.screenTitle}>{title}</Text><IconButton icon={showSearch ? 'x' : 'search'} onPress={() => { setShowSearch((value) => !value); if (showSearch) setSearch(''); }} /></View>
      {showSearch ? <SearchBar value={search} onChangeText={setSearch} placeholder="Search providers by name" /> : null}
      <View style={styles.communityHero}><View style={styles.communityIcon}><Feather name={admin ? 'activity' : 'users'} size={20} color={onPrimary} /></View><View style={styles.communityCopy}><Text style={styles.communityTitle}>{admin ? 'Security audit logs' : role === 'customer' ? 'Your trusted providers' : 'Connect with local professionals'}</Text><Text style={styles.communityText}>{admin ? 'Audit events are available to authorized administrators.' : 'Find providers from completed Handyskillz profiles.'}</Text></View></View>
      {!admin && role === 'customer' ? <View style={styles.tabPills}><Pressable onPress={() => setShowSaved(false)}><Text style={!showSaved ? styles.activePill : styles.inactivePill}>Discover</Text></Pressable><Pressable onPress={() => setShowSaved(true)}><Text style={showSaved ? styles.activePill : styles.inactivePill}>Saved</Text></Pressable></View> : null}
      <SectionHeader title={admin ? 'Recent activity' : showSaved ? 'Saved providers' : 'Available providers'} action="Refresh" onAction={() => void loadProviders()} />
      {loading ? <Text style={styles.communityRowMeta}>Loading providers…</Text> : null}
      {adminEvents.map((event) => <View key={event.id} style={styles.communityRow}>
        <View style={[styles.communityAvatar, { backgroundColor: lime }]}><Feather name="activity" size={17} color={onPrimary} /></View>
        <View style={[styles.communityRowCopy, { flex: 1 }]}><Text style={styles.communityRowTitle}>{event.action}</Text><Text style={styles.communityRowMeta}>{event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ''} · {new Date(event.created_at).toLocaleString()}</Text></View>
      </View>)}
      {!loading && !networkError && providers.length === 0 ? <Text style={styles.communityRowMeta}>{showSaved ? 'No saved providers yet. Discover experts and bookmark the ones you trust.' : 'No matching provider profiles yet.'}</Text> : null}
      {providers.map((provider) => (
        <View key={provider.id} style={styles.communityRow}>
          <View style={[styles.communityAvatar, { backgroundColor: lime }]}><Text style={styles.matchInitial}>{String(provider.display_name || '?').charAt(0)}</Text></View>
          <Pressable onPress={() => onAction(provider.display_name, `${provider.role} · ${provider.city || 'Location not set'}\n${(provider.skills || []).join(', ') || provider.bio || 'Handyskillz profile'}`)} style={[styles.communityRowCopy, { flex: 1 }]}>
            <Text style={styles.communityRowTitle}>{provider.display_name}</Text><Text style={styles.communityRowMeta}>{provider.role} · {provider.city || 'Location not set'} · {Number(provider.completed_jobs) || 0} completed jobs</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Message ${provider.display_name}`} onPress={() => onStartConversation(provider.id)}><Feather name="message-circle" size={18} color={accentText} /></Pressable>
          {role === 'customer' ? <Pressable accessibilityRole="button" accessibilityLabel={savedIds.includes(provider.id) ? 'Remove saved provider' : 'Save provider'} onPress={() => void toggleSaved(provider.id)}><Feather name={savedIds.includes(provider.id) ? 'bookmark' : 'bookmark'} size={18} color={savedIds.includes(provider.id) ? lime : muted} /></Pressable> : null}
        </View>
      ))}
      {admin && !loading && adminEvents.length === 0 && !networkError ? <Text style={styles.communityRowMeta}>No audit events recorded yet.</Text> : null}
      {networkError ? <Text style={styles.error}>{networkError}</Text> : null}
      <View style={styles.spacer} />
    </ScrollView>
  );
}

function ProfileScreen({ role, displayName, avatarUrl, onRolePicker, themeMode, onToggleTheme, onSignOut, onOpenAddresses, onEditProfile, onOpenNetwork, onOpenGuilds, onOpenSecurity, onOpenPaymentHistory, onOpenTeam, onOpenPayout, onOpenAvailability, onOpenSupport, onOpenNotifications, onOpenPaymentTransfers }: { role: Role; displayName: string; avatarUrl?: string | null; onRolePicker: () => void; themeMode: ThemeMode; onToggleTheme: () => void; onSignOut: () => void; onOpenAddresses: () => void; onEditProfile: () => void; onOpenNetwork: () => void; onOpenGuilds: () => void; onOpenSecurity: () => void; onOpenPaymentHistory: () => void; onOpenTeam: () => void; onOpenPayout: () => void; onOpenAvailability: () => void; onOpenSupport: () => void; onOpenNotifications: () => void; onOpenPaymentTransfers: () => void }) {
  const { activePalette, accentText, onPrimary, ink, muted, styles } = useAppTheme();
  const accountLabel = role === 'customer' ? 'Profile' : roleConfig[role].tabs.find((tab) => tab.id === 'profile')?.label;
  const menu = role === 'customer'
    ? [['My Addresses', 'map-pin'], ['Payment history', 'credit-card'], ['Saved providers', 'bookmark'], ['Security and sessions', 'shield'], ['Notifications', 'bell'], ['Help and support', 'info']]
    : role === 'admin'
      ? [['Guild management', 'users'], ['Payment transfers', 'dollar-sign'], ['Security and sessions', 'shield'], ['Notifications', 'bell'], ['Help and support', 'info']]
      : role === 'artisan' || role === 'professional'
        ? [['Public profile', 'user'], ['Payout settings', 'credit-card'], ['Availability', 'calendar'], ['Guilds', 'users'], ['Security and sessions', 'shield'], ['Help and support', 'info']]
        : [['Public profile', 'user'], ['Payout settings', 'credit-card'], ['Availability', 'calendar'], ...(role === 'business' ? [['Team access', 'users']] : []), ['Security and sessions', 'shield'], ['Help and support', 'info']];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
      <View style={styles.simpleHeader}><Text style={styles.screenTitle}>{accountLabel}</Text><IconButton icon="edit-2" onPress={onEditProfile} /></View>
      <Pressable onPress={onRolePicker} style={({ pressed }) => [styles.profileCard, pressed && styles.pressed]}>
        <View style={styles.profileAvatar}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.profileAvatarImage} /> : <Feather name="user" size={20} color="#302019" />}</View>
        <View style={styles.profileCopy}><Text style={styles.profileName}>{displayName || 'Your profile'}</Text><Text style={styles.profileHandle}>{roleConfig[role].label} account</Text></View><Feather name="chevron-right" size={18} color={onPrimary} />
      </Pressable>
      {role !== 'customer' && role !== 'admin' ? <Pressable onPress={onOpenPayout} style={({ pressed }) => [styles.earningsCard, pressed && styles.pressed]}><View><Text style={styles.earningsLabel}>Payout account</Text><Text style={styles.earningsValue}>Manage bank</Text></View><View style={styles.earningsIcon}><Feather name="credit-card" size={18} color={ink} /></View></Pressable> : null}
      <View style={styles.profileMenu}>
        {menu.map(([label, icon]) => (
          <Pressable key={label} onPress={() => { Haptics.selectionAsync(); if (label === 'My Addresses') onOpenAddresses(); else if (label === 'Saved providers') onOpenNetwork(); else if (label === 'Guilds' || label === 'Guild management') onOpenGuilds(); else if (label === 'Security and sessions') onOpenSecurity(); else if (label === 'Payment history') onOpenPaymentHistory(); else if (label === 'Team access') onOpenTeam(); else if (label === 'Public profile') onEditProfile(); else if (label === 'Payout settings') onOpenPayout(); else if (label === 'Availability') onOpenAvailability(); else if (label === 'Help and support') onOpenSupport(); else if (label === 'Notifications') onOpenNotifications(); else if (label === 'Payment transfers') onOpenPaymentTransfers(); }} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
            <Feather name={icon as IconName} size={18} color={accentText} /><Text style={styles.menuLabel}>{label}</Text><Feather name="chevron-right" size={16} color={muted} />
          </Pressable>
        ))}
      </View>
      <View style={styles.settingsCard}>
        <View style={styles.settingsRow}>
        <View style={styles.settingsIcon}><Feather name={themeMode === 'dark' ? 'moon' : 'sun'} size={16} color={accentText} /></View>
          <View style={styles.settingsCopy}><Text style={styles.menuLabel}>{themeMode === 'dark' ? 'Dark mode' : 'Light mode'}</Text><Text style={styles.settingsHint}>Use the {themeMode === 'dark' ? 'dark' : 'light'} Handyskillz appearance</Text></View>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: themeMode === 'light' }} testID="theme-toggle" onPress={onToggleTheme} style={[styles.themeSwitch, themeMode === 'light' && styles.themeSwitchOn]}>
            <View style={[styles.themeThumb, themeMode === 'light' && styles.themeThumbOn]} />
          </Pressable>
        </View>
        <Pressable testID="sign-out" onPress={onSignOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
          <Feather name="log-out" size={17} color={activePalette.destructive} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
      <View style={styles.spacer} />
    </ScrollView>
  );
}

function ChatWorkspace({ onBack, conversationId, onSelectConversation, onBrowseProviders }: { onBack: () => void; conversationId: string | null; onSelectConversation: (id: string) => void; onBrowseProviders: () => void }) {
  const { lime, ink, muted, styles } = useAppTheme();
  const { getToken, userId } = useAuth();
  const [draft, setDraft] = useState('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
  const apiRequest = async (path: string, init?: RequestInit) => {
    if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to use protected messaging.');
    const token = await getToken();
    if (!token) throw new Error('Sign in again to view messages.');
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init?.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}/api${path}`, { ...init, headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Messaging request failed.');
    return payload;
  };
  const loadConversations = async () => {
    try {
      const payload = await apiRequest('/conversations');
      setConversations(Array.isArray(payload.conversations) ? payload.conversations : []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load conversations.'); }
  };
  const loadMessages = async (id: string) => {
    setBusy(true); setError('');
    try {
      const payload = await apiRequest(`/conversations/${encodeURIComponent(id)}/messages`);
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load messages.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void loadConversations(); }, []);
  useEffect(() => {
    if (!conversationId) { setActiveConversation(null); setMessages([]); return; }
    setActiveConversation(conversations.find((item) => item.id === conversationId) || null);
    void loadMessages(conversationId);
  }, [conversationId, conversations.length]);
  const send = async () => {
    const body = draft.trim();
    if (!body || !conversationId || busy) return;
    setBusy(true); setError('');
    try {
      await apiRequest(`/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
      setDraft('');
      await loadMessages(conversationId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (sendError) { setError(sendError instanceof Error ? sendError.message : 'Could not send message.'); setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={Platform.OS === 'web' ? 0 : 12}>
      <View style={styles.chatScreen}>
        <View style={styles.chatHeader}><IconButton icon={conversationId ? 'chevron-left' : 'refresh-cw'} onPress={conversationId ? onBack : () => void loadConversations()} /><View style={{ flex: 1 }}><Text style={styles.chatName}>{conversationId ? activeConversation?.participant?.display_name || 'Conversation' : 'Messages'}</Text><Text style={styles.onlineText}>{conversationId ? activeConversation?.participant?.role || 'Protected chat' : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}</Text></View>{conversationId && activeConversation?.participant?.phone ? <IconButton icon="phone" onPress={() => Linking.openURL(`tel:${activeConversation.participant.phone}`).catch(() => setError('This device cannot place phone calls.'))} /> : null}</View>
        {!conversationId ? <ScrollView style={styles.messageList} contentContainerStyle={styles.messageContent}>
          {conversations.map((conversation) => <Pressable key={conversation.id} onPress={() => onSelectConversation(conversation.id)} style={({ pressed }) => [styles.communityRow, pressed && styles.pressed]}>
            <View style={[styles.communityAvatar, { backgroundColor: lime }]}><Text style={styles.matchInitial}>{String(conversation.participant?.display_name || '?').charAt(0)}</Text></View>
            <View style={styles.communityRowCopy}><Text style={styles.communityRowTitle}>{conversation.participant?.display_name || 'Handyskillz member'}</Text><Text style={styles.communityRowMeta}>{conversation.latest_message?.body || 'Start a protected conversation'}</Text></View>
          </Pressable>)}
          {conversations.length === 0 ? <View><Text style={styles.communityRowMeta}>Your protected conversations will appear here.</Text><Pressable onPress={onBrowseProviders} style={[styles.primaryButton, { marginTop: 14 }]}><Text style={styles.primaryButtonText}>Find a provider</Text></Pressable></View> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView> : <>
          <ScrollView style={styles.messageList} contentContainerStyle={styles.messageContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {messages.map((item) => { const mine = item.sender_id === userId; return <View key={item.id} style={[styles.messageBlock, mine && styles.messageBlockMine]}><Text style={[styles.messageTime, mine && styles.messageTimeMine]}>{new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text><View style={[styles.bubble, mine && styles.bubbleMine]}><Text style={styles.bubbleText}>{item.body}</Text></View></View>; })}
            {!busy && messages.length === 0 ? <Text style={styles.communityRowMeta}>Send a message to start the conversation.</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} onSubmitEditing={() => void send()} placeholder="Type a message..." placeholderTextColor={muted} style={styles.composerInput} returnKeyType="send" /><Pressable testID="send-message" disabled={busy || !draft.trim()} onPress={() => void send()} style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}><Feather name="arrow-up-right" size={18} color={ink} /></Pressable></View>
        </>}
      </View>
    </KeyboardAvoidingView>
  );
}

function WelcomeScreen() {
  const { lime, onPrimary, styles } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.welcomeScreen, { paddingTop: insets.top + 30, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.welcomeGlow} />
      <View>
        <Text style={styles.welcomeBrand}>handy<Text style={styles.brandAccent}>skillz</Text></Text>
        <Text style={styles.welcomeKicker}>SKILL HUB · NIGERIA</Text>
      </View>
      <View style={styles.welcomeHero}>
        <View style={styles.welcomeMark}><Feather name="zap" size={25} color={onPrimary} /></View>
        <Text style={styles.welcomeTitle}>Find the right skill. Build what matters.</Text>
        <Text style={styles.welcomeCopy}>A trusted place to hire local experts, win meaningful work, and keep every conversation and payment protected.</Text>
      </View>
      <View style={styles.welcomeFeatures}>
        {['Search expert profiles by skill and location', 'Review portfolios and save providers', 'Message providers through protected conversations'].map((item) => <View key={item} style={styles.welcomeFeature}><Feather name="check" size={14} color={lime} /><Text style={styles.welcomeFeatureText}>{item}</Text></View>)}
      </View>
      <View style={styles.welcomeActions}>
        <Pressable testID="create-account" onPress={() => router.push('/(auth)/sign-up')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Create an account</Text></Pressable>
        <Pressable testID="login" onPress={() => router.push('/(auth)/sign-in')} style={({ pressed }) => [styles.welcomeSecondary, pressed && styles.pressed]}><Text style={styles.welcomeSecondaryText}>I already have an account</Text></Pressable>
      </View>
      <Text style={styles.welcomeLegal}>By continuing, you agree to use Handyskillz safely and keep transactions on-platform.</Text>
    </View>
  );
}

export default function Index() {
  const { isLoaded, isSignedIn, signOut, getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [storedRole, setRole] = useState<Role>('customer');
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const role = storedRole === 'admin' && !canAccessAdmin ? 'customer' : storedRole;
  const [accountProfile, setAccountProfile] = useState<{ display_name?: string | null; avatar_url?: string | null } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [showRoles, setShowRoles] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [actionModal, setActionModal] = useState<{ title: string; message: string } | null>(null);
  const [showAddresses, setShowAddresses] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showCreateOpportunity, setShowCreateOpportunity] = useState(false);
  const [showVerificationQueue, setShowVerificationQueue] = useState(false);
  const [showPayoutSettings, setShowPayoutSettings] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAdminPaymentTransfers, setShowAdminPaymentTransfers] = useState(false);
  const [showGuilds, setShowGuilds] = useState(false);
  const [showSecuritySessions, setShowSecuritySessions] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [showBusinessTeam, setShowBusinessTeam] = useState(false);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('handyskillz-theme').then((stored) => {
      if (stored === 'light' || stored === 'dark') setThemeMode(stored);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setProfileLoading(false); return; }
    setProfileLoading(true);
    setCanAccessAdmin(false);
    let cancelled = false;
    void (async () => {
      try {
        const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
        if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to load your account role.');
        const token = await getToken();
        if (!token) throw new Error('Sign in again to load your account.');
        const response = await fetch(`${apiBase}/api/profile/me`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load your account.');
        const profileRole = payload.profile?.role;
        if (!cancelled) {
          setAccountProfile(payload.profile || null);
          setCanAccessAdmin(payload.canAccessAdmin === true);
        }
        if (typeof profileRole === 'string' && roles.includes(profileRole as Role)) {
          if (!cancelled) setRole(profileRole as Role);
        } else if (!cancelled) router.replace('/profile-setup');
      } catch (error) {
        if (!cancelled) setActionModal({ title: 'Account', message: error instanceof Error ? error.message : 'Could not load your account.' });
      } finally { if (!cancelled) setProfileLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, user?.id]);

  const theme = useMemo(() => createTheme(colors[themeMode]), [themeMode]);
  const { styles } = theme;

  const toggleTheme = () => {
    const nextMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextMode);
    AsyncStorage.setItem('handyskillz-theme', nextMode).catch(() => undefined);
    Haptics.selectionAsync();
  };

  const handleSignOut = () => {
    void (async () => {
      try {
        const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
        const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
        if (Platform.OS !== 'web' && projectId && apiBase) {
          const token = await getToken();
          const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
          if (token) await fetch(`${apiBase}/api/notifications/push-token`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: pushToken }) });
        }
      } catch { /* Sign-out must remain available when push services are offline. */ }
      await signOut().catch(() => undefined);
    })();
  };

  const openJobFromNotification = async (jobId: string) => {
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
      if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to open this job.');
      const token = await getToken();
      if (!token) throw new Error('Sign in again to open this job.');
      const response = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not open this job.');
      setSelectedJob(payload.job);
      setScreen('work');
    } catch (error) { setActionModal({ title: 'Job', message: error instanceof Error ? error.message : 'Could not open this job.' }); }
  };

  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data || {};
    setShowNotifications(false);
    if (typeof data.conversationId === 'string') { setChatConversationId(data.conversationId); setScreen('chat'); }
    else if (typeof data.jobId === 'string') void openJobFromNotification(data.jobId);
    else if (typeof data.ticketId === 'string') setShowSupport(true);
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
        Notifications.clearLastNotificationResponseAsync();
      }
    }).catch(() => undefined);
    return () => subscription.remove();
  }, [isLoaded, isSignedIn]);

  const startConversation = async (providerId: string, jobId?: string) => {
    const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
    try {
      if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to start protected conversations.');
      const token = await getToken();
      if (!token) throw new Error('Sign in again to start a conversation.');
      const response = await fetch(`${apiBase}/api/conversations`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, ...(jobId ? { jobId } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not start conversation.');
      setChatConversationId(payload.conversation.id);
      setScreen('chat');
    } catch (error) {
      setActionModal({ title: 'Messages', message: error instanceof Error ? error.message : 'Could not start conversation.' });
    }
  };

  const activeTab: Tab = screen;
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 10);
  const switchRole = async (next: Role) => {
    if (next === 'admin' && !canAccessAdmin) return;
    Haptics.selectionAsync();
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
      if (!apiBase) throw new Error('Set EXPO_PUBLIC_API_URL to update your account role.');
      const token = await getToken();
      if (!token) throw new Error('Sign in again before changing your account role.');
      const response = await fetch(`${apiBase}/api/profile/me/role`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: next }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not change your account role.');
      setRole(payload.profile.role as Role);
      setAccountProfile((current) => current ? { ...current, ...payload.profile } : payload.profile);
      setScreen('dashboard');
      setShowRoles(false);
    } catch (error) { setActionModal({ title: 'Account role', message: error instanceof Error ? error.message : 'Could not change your account role.' }); }
  };
  const content = useMemo(() => {
    if (screen === 'chat') return <ChatWorkspace conversationId={chatConversationId} onSelectConversation={setChatConversationId} onBack={() => { if (chatConversationId) setChatConversationId(null); else setScreen('dashboard'); }} onBrowseProviders={() => setScreen('network')} />;
    if (screen === 'work') return <WorkScreen role={role} onOpenJob={setSelectedJob} />;
    if (screen === 'network') return <NetworkScreen role={role} onAction={(title, message) => setActionModal({ title, message })} onStartConversation={startConversation} />;
    if (screen === 'profile') return <ProfileScreen role={role} displayName={accountProfile?.display_name?.trim() || user?.fullName || ''} avatarUrl={accountProfile?.avatar_url || user?.imageUrl} onRolePicker={() => setShowRoles(true)} themeMode={themeMode} onToggleTheme={toggleTheme} onSignOut={handleSignOut} onOpenAddresses={() => setShowAddresses(true)} onEditProfile={() => setShowProfileEditor(true)} onOpenNetwork={() => setScreen('network')} onOpenGuilds={() => setShowGuilds(true)} onOpenSecurity={() => setShowSecuritySessions(true)} onOpenPaymentHistory={() => setShowPaymentHistory(true)} onOpenTeam={() => setShowBusinessTeam(true)} onOpenPayout={() => setShowPayoutSettings(true)} onOpenAvailability={() => setShowAvailability(true)} onOpenSupport={() => setShowSupport(true)} onOpenNotifications={() => setShowNotifications(true)} onOpenPaymentTransfers={() => setShowAdminPaymentTransfers(true)} />;
    return role === 'customer' ? <CustomerDashboard onAction={(title, message) => setActionModal({ title, message })} /> : <ProviderDashboard role={role} onOpenJob={setSelectedJob} onCreateOpportunity={() => setShowCreateOpportunity(true)} onSeeAll={() => setScreen('work')} onReviewQueue={() => setShowVerificationQueue(true)} />;
  }, [role, screen, themeMode, chatConversationId, startConversation, accountProfile, user]);

  // Keep this after every hook. Clerk changes `isLoaded` as it initializes,
  // so returning before `useMemo` would change the hook order between renders.
  if (!isLoaded) return null;
  if (!isSignedIn) return <AppThemeContext.Provider value={theme}><WelcomeScreen /></AppThemeContext.Provider>;
  if (profileLoading) return null;

  return (
    <AppThemeContext.Provider value={theme}>
    <View style={[styles.app, { paddingTop: topPadding }]}>
      <AppHeader role={role} onRolePicker={() => setShowRoles(true)} onNotifications={() => setShowNotifications(true)} />
      <View style={styles.appInner}>{content}</View>
      {showRoles ? <RolePicker role={role} canAccessAdmin={canAccessAdmin} onSelect={switchRole} onClose={() => setShowRoles(false)} /> : null}
      <View style={{ paddingBottom: bottomPadding }}><BottomNav role={role} tab={activeTab} onChange={setScreen} /></View>
      <ActionModal visible={Boolean(actionModal)} title={actionModal?.title ?? ''} message={actionModal?.message ?? ''} onClose={() => setActionModal(null)} />
      <AddressBookModal visible={showAddresses} onClose={() => setShowAddresses(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
      <ProfileEditorModal visible={showProfileEditor} onClose={() => setShowProfileEditor(false)} onSaved={setAccountProfile} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
      <CreateOpportunityModal visible={showCreateOpportunity} onClose={() => setShowCreateOpportunity(false)} onCreated={() => setActionModal({ title: 'Opportunity published', message: 'Your listing is live for providers to review.' })} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
      <AdminVerificationQueueModal visible={showVerificationQueue} onClose={() => setShowVerificationQueue(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
      <PayoutSettingsModal visible={showPayoutSettings} onClose={() => setShowPayoutSettings(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
      <AvailabilityModal visible={showAvailability} onClose={() => setShowAvailability(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
      <SupportModal visible={showSupport} onClose={() => setShowSupport(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} isAdmin={role === 'admin'} />
      <NotificationsModal visible={showNotifications} onClose={() => setShowNotifications(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} onOpenConversation={(id) => { setChatConversationId(id); setScreen('chat'); }} onOpenJob={(id) => void openJobFromNotification(id)} onOpenSupport={() => setShowSupport(true)} />
      <JobProposalModal visible={Boolean(selectedJob)} job={selectedJob} role={role} userId={user?.id} email={user?.primaryEmailAddress?.emailAddress || ''} onClose={() => setSelectedJob(null)} onStartConversation={startConversation} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
      <AdminPaymentTransfersModal visible={showAdminPaymentTransfers} onClose={() => setShowAdminPaymentTransfers(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
      <GuildsModal visible={showGuilds} onClose={() => setShowGuilds(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} isAdmin={role === 'admin'} />
      <SecuritySessionsModal visible={showSecuritySessions} onClose={() => setShowSecuritySessions(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
      <PaymentHistoryModal visible={showPaymentHistory} onClose={() => setShowPaymentHistory(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} onOpenJob={openJobFromNotification} />
      <BusinessTeamModal visible={showBusinessTeam} onClose={() => setShowBusinessTeam(false)} getToken={getToken} palette={themeMode === 'light' ? colors.light : colors.dark} />
    </View>
    </AppThemeContext.Provider>
  );
}

function createStyles(activePalette: Palette) {
  const { primary: lime, tint: accentText, primaryForeground: onPrimary,
    background: ink, card: panel, secondary: panelSoft,
    foreground: text, mutedForeground: muted } = activePalette;
  return StyleSheet.create({
  app: { flex: 1, backgroundColor: ink },
  error: { color: activePalette.destructive, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'flex-end' },
  actionModal: { width: '100%', maxWidth: 520, backgroundColor: panel, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 30 },
  modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: muted, alignSelf: 'center', marginBottom: 18, opacity: 0.55 },
  modalTitle: { color: text, fontSize: 19, fontFamily: 'Inter_700Bold' },
  modalMessage: { color: muted, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 8, marginBottom: 16 },
  appInner: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 28, gap: 16 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { color: text, fontSize: 12, fontFamily: 'Inter_500Medium' },
  brandMark: { color: text, fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 8, letterSpacing: -0.3 },
  brandAccent: { color: accentText },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: panel, alignItems: 'center', justifyContent: 'center' },
  iconButtonActive: { backgroundColor: lime },
  roleBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: lime, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: muted, fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  greeting: { color: text, fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e0a77c', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#302019', fontSize: 20, fontFamily: 'Inter_700Bold' },
  searchBar: { height: 50, borderRadius: 25, backgroundColor: panel, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, gap: 12 },
  searchInput: { color: text, fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1, paddingVertical: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  sectionTitle: { color: text, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  sectionAction: { color: text, fontSize: 12, fontFamily: 'Inter_500Medium' },
  aiCard: { backgroundColor: lime, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  aiIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(17,18,15,0.15)', alignItems: 'center', justifyContent: 'center' },
  aiCopy: { flex: 1 },
  aiTitle: { color: onPrimary, fontSize: 13, fontFamily: 'Inter_700Bold' },
  aiText: { color: '#4c5625', fontSize: 10, lineHeight: 14, marginTop: 3, fontFamily: 'Inter_500Medium' },
  chipRow: { flexDirection: 'row', gap: 8 },
  skillChip: { backgroundColor: panel, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  skillChipActive: { backgroundColor: activePalette.secondary },
  skillChipText: { color: text, fontSize: 11, fontFamily: 'Inter_500Medium' },
  skillChipTextActive: { color: accentText },
  matchCard: { backgroundColor: panel, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  matchAvatar: { width: 45, height: 45, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  matchInitial: { color: onPrimary, fontSize: 18, fontFamily: 'Inter_700Bold' },
  matchCopy: { flex: 1, gap: 3 },
  matchNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5 },
  matchName: { color: text, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  matchPrice: { color: accentText, fontSize: 12, fontFamily: 'Inter_700Bold' },
  matchSkill: { color: muted, fontSize: 10, fontFamily: 'Inter_400Regular' },
  matchMeta: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 },
  metaAccent: { color: accentText, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  metaText: { color: muted, fontSize: 10, fontFamily: 'Inter_400Regular' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  verifiedText: { color: accentText, fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  primaryButton: { height: 52, borderRadius: 26, backgroundColor: lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
  primaryButtonText: { color: onPrimary, fontSize: 13, fontFamily: 'Inter_700Bold' },
  spacer: { height: 20 },
  bottomNav: { marginHorizontal: 20, paddingVertical: 11, paddingHorizontal: 4, borderRadius: 24, backgroundColor: panel, flexDirection: 'row', justifyContent: 'space-around' },
  navItem: { alignItems: 'center', justifyContent: 'center', width: 62, gap: 4 },
  navLabel: { color: muted, fontSize: 9, fontFamily: 'Inter_500Medium' },
  navLabelActive: { color: accentText },
  rolePicker: { position: 'absolute', top: 58, left: 20, right: 20, zIndex: 10, backgroundColor: panel, borderRadius: 22, padding: 13, borderWidth: 1, borderColor: activePalette.border },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  pickerTitle: { color: text, fontSize: 15, fontFamily: 'Inter_700Bold' },
  pickerSubtitle: { color: muted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  roleOption: { height: 47, borderRadius: 15, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  roleOptionActive: { backgroundColor: lime },
  roleIcon: { width: 29, height: 29, borderRadius: 15, backgroundColor: panelSoft, alignItems: 'center', justifyContent: 'center' },
  roleIconActive: { backgroundColor: 'rgba(17,18,15,0.14)' },
  roleOptionText: { color: text, flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  roleOptionTextActive: { color: onPrimary, fontFamily: 'Inter_700Bold' },
  metricRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, backgroundColor: panel, borderRadius: 18, padding: 14 },
  metricLabel: { color: muted, fontSize: 10, fontFamily: 'Inter_500Medium' },
  metricValue: { color: text, fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 8 },
  metricDelta: { color: accentText, fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 4 },
  leadCard: { backgroundColor: panel, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  leadIcon: { width: 37, height: 37, borderRadius: 19, backgroundColor: panelSoft, alignItems: 'center', justifyContent: 'center' },
  leadCopy: { flex: 1 },
  leadTitle: { color: text, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  leadMeta: { color: muted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 },
  leadRight: { alignItems: 'flex-end', gap: 8 },
  leadBudget: { color: accentText, fontSize: 11, fontFamily: 'Inter_700Bold' },
  simpleHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  screenTitle: { color: text, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  tabPills: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  activePill: { color: onPrimary, backgroundColor: lime, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 16, fontSize: 11, fontFamily: 'Inter_700Bold' },
  inactivePill: { color: muted, backgroundColor: panel, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 16, fontSize: 11, fontFamily: 'Inter_500Medium' },
  workCard: { backgroundColor: panel, borderRadius: 19, padding: 13, flexDirection: 'row', gap: 11, alignItems: 'center' },
  workIcon: { width: 39, height: 39, borderRadius: 20, backgroundColor: panelSoft, alignItems: 'center', justifyContent: 'center' },
  workCopy: { flex: 1, gap: 4 },
  workTitle: { color: text, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  workSubtitle: { color: muted, fontSize: 10, fontFamily: 'Inter_400Regular' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: panelSoft, marginTop: 5, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: lime },
  workAmount: { alignItems: 'flex-end', gap: 11 },
  workAmountText: { color: accentText, fontSize: 11, fontFamily: 'Inter_700Bold' },
  escrowMiniCard: { backgroundColor: panel, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: activePalette.border },
  escrowCopy: { flex: 1 },
  escrowTitle: { color: text, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  escrowText: { color: muted, fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular', marginTop: 3 },
  communityHero: { backgroundColor: lime, borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11 },
  communityIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(17,18,15,0.15)', alignItems: 'center', justifyContent: 'center' },
  communityCopy: { flex: 1 },
  communityTitle: { color: onPrimary, fontSize: 13, fontFamily: 'Inter_700Bold' },
  communityText: { color: '#4c5625', fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium', marginTop: 3 },
  communityRow: { backgroundColor: panel, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  communityAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  communityRowCopy: { flex: 1 },
  communityRowTitle: { color: text, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  communityRowMeta: { color: muted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 },
  profileCard: { backgroundColor: lime, borderRadius: 21, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#e0a77c', alignItems: 'center', justifyContent: 'center' },
  profileAvatarImage: { width: '100%', height: '100%', borderRadius: 23 },
  profileAvatarText: { color: '#302019', fontSize: 19, fontFamily: 'Inter_700Bold' },
  profileCopy: { flex: 1 },
  profileName: { color: onPrimary, fontSize: 14, fontFamily: 'Inter_700Bold' },
  profileHandle: { color: '#4b5525', fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 3 },
  earningsCard: { backgroundColor: panel, borderRadius: 19, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  earningsLabel: { color: muted, fontSize: 10, fontFamily: 'Inter_500Medium' },
  earningsValue: { color: accentText, fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 5 },
  earningsIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: panelSoft, alignItems: 'center', justifyContent: 'center' },
  profileMenu: { gap: 8 },
  menuItem: { height: 55, backgroundColor: panel, borderRadius: 17, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuLabel: { color: text, fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
  chatScreen: { flex: 1, paddingHorizontal: 20 },
  chatHeader: { height: 53, flexDirection: 'row', alignItems: 'center', gap: 11 },
  chatName: { color: text, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  onlineText: { color: accentText, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  securityBanner: { backgroundColor: panelSoft, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 8 },
  securityIcon: { width: 29, height: 29, borderRadius: 15, backgroundColor: panelSoft, alignItems: 'center', justifyContent: 'center' },
  securityText: { color: text, fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  securityStrong: { color: accentText, fontFamily: 'Inter_700Bold' },
  messageList: { flex: 1 },
  messageContent: { gap: 14, paddingVertical: 9 },
  messageBlock: { alignItems: 'flex-start' },
  messageBlockMine: { alignItems: 'flex-end' },
  messageTime: { color: muted, fontSize: 9, marginBottom: 5, fontFamily: 'Inter_400Regular' },
  messageTimeMine: { alignSelf: 'flex-end' },
  bubble: { maxWidth: '84%', backgroundColor: panel, padding: 12, borderRadius: 17, borderTopLeftRadius: 5 },
  bubbleMine: { backgroundColor: panelSoft, borderTopLeftRadius: 17, borderTopRightRadius: 5 },
  bubbleText: { color: text, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  actionCard: { backgroundColor: panel, borderRadius: 17, borderWidth: 1, borderColor: activePalette.border, padding: 12, flexDirection: 'row', gap: 10 },
  actionCardDone: { borderColor: '#596d30' },
  actionIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: panelSoft, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1 },
  actionTitle: { color: text, fontSize: 12, fontFamily: 'Inter_700Bold' },
  actionDescription: { color: muted, fontSize: 10, lineHeight: 14, marginTop: 3, fontFamily: 'Inter_400Regular' },
  actionButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: lime, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 7, marginTop: 8 },
  actionButtonDone: { backgroundColor: lime },
  actionButtonText: { color: onPrimary, fontSize: 9, fontFamily: 'Inter_700Bold' },
  quickReplies: { flexDirection: 'row', gap: 7, paddingVertical: 8 },
  quickReply: { backgroundColor: panel, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8 },
  quickReplyText: { color: text, fontSize: 10, fontFamily: 'Inter_500Medium' },
  composer: { height: 54, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10, backgroundColor: panel, paddingHorizontal: 7, borderRadius: 27 },
  composerInput: { flex: 1, color: text, fontSize: 12, fontFamily: 'Inter_400Regular', paddingHorizontal: 4 },
  sendButton: { width: 37, height: 37, borderRadius: 19, backgroundColor: lime, alignItems: 'center', justifyContent: 'center' },
  detailPanel: { backgroundColor: panel, borderRadius: 22, padding: 16, gap: 11 },
  detailPanelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailCategory: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  detailCategoryText: { color: accentText, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  detailAmount: { color: accentText, fontSize: 13, fontFamily: 'Inter_700Bold' },
  detailJobTitle: { color: text, fontSize: 23, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  detailJobDescription: { color: muted, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  detailFacts: { flexDirection: 'row', gap: 8 },
  detailFact: { color: muted, fontSize: 10, fontFamily: 'Inter_400Regular' },
  checkRow: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkCircle: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: lime, alignItems: 'center', justifyContent: 'center', backgroundColor: panelSoft },
  checkCircleActive: { backgroundColor: lime },
  checkLabel: { color: text, fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
  checkStatus: { color: muted, fontSize: 10, fontFamily: 'Inter_400Regular' },
  welcomeScreen: { flex: 1, backgroundColor: ink, paddingHorizontal: 24, justifyContent: 'space-between', overflow: 'hidden' },
  welcomeGlow: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: panelSoft, top: -110, right: -100, opacity: 0.7 },
  welcomeBrand: { color: text, fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  welcomeKicker: { color: accentText, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.6, marginTop: 9 },
  welcomeHero: { gap: 13, marginTop: 24 },
  welcomeMark: { width: 54, height: 54, borderRadius: 18, backgroundColor: lime, alignItems: 'center', justifyContent: 'center' },
  welcomeTitle: { color: text, fontSize: 36, lineHeight: 41, fontFamily: 'Inter_700Bold', letterSpacing: -1.4, maxWidth: 340 },
  welcomeCopy: { color: muted, fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular', maxWidth: 330 },
  welcomeFeatures: { gap: 13, marginTop: 12 },
  welcomeFeature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  welcomeFeatureText: { color: text, fontSize: 12, fontFamily: 'Inter_500Medium' },
  welcomeActions: { gap: 9, marginTop: 12 },
  welcomeSecondary: { height: 50, borderRadius: 25, borderWidth: 1, borderColor: activePalette.border, alignItems: 'center', justifyContent: 'center' },
  welcomeSecondaryText: { color: text, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  welcomeLegal: { color: activePalette.mutedForeground, fontSize: 9, lineHeight: 13, textAlign: 'center', fontFamily: 'Inter_400Regular', maxWidth: 290, alignSelf: 'center', marginTop: 8 },
  settingsCard: { backgroundColor: panel, borderRadius: 18, padding: 12, gap: 12 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  settingsIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: activePalette.secondary, alignItems: 'center', justifyContent: 'center' },
  settingsCopy: { flex: 1 },
  settingsHint: { color: muted, fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 3 },
  themeSwitch: { width: 48, height: 28, borderRadius: 15, padding: 3, justifyContent: 'center', backgroundColor: activePalette.border },
  themeSwitchOn: { backgroundColor: lime },
  themeThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: activePalette.foreground },
  themeThumbOn: { alignSelf: 'flex-end', backgroundColor: activePalette.primaryForeground },
  signOutButton: { height: 44, borderRadius: 13, borderWidth: 1, borderColor: activePalette.destructive, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutText: { color: activePalette.destructive, fontSize: 12, fontFamily: 'Inter_700Bold' },
  });
}

