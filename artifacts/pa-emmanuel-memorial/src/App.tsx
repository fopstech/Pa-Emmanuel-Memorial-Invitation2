import { useEffect, useRef, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import {
  useAdminLogin,
  useAdminLogout,
  useCheckInInvitation,
  useCheckInGuest,
  useCreateGuest,
  useDeleteGuest,
  useGetAdminDashboard,
  useGetAdminSession,
  useGetEvent,
  useGetGuest,
  useGetInvitation,
  useGetUsherSession,
  useImportGuests,
  useListGuests,
  usePreviewGuestImport,
  useUpdateGuest,
  useUpdateRsvp,
  useUsherLogin,
  useUsherLogout,
  getGetAdminDashboardQueryKey,
  getGetAdminSessionQueryKey,
  getGetEventQueryKey,
  getGetGuestQueryKey,
  getGetInvitationQueryKey,
  getGetUsherSessionQueryKey,
  getListGuestsQueryKey,
  type Event,
  type Guest,
  type RsvpStatus,
} from '@workspace/api-client-react';
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clipboard,
  Copy,
  FileUp,
  Heart,
  LoaderCircle,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();

const formatDate = (value?: string) => {
  if (!value) return 'Date to be announced';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

const formatTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit' }).format(date);
  return value;
};

const errorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'error' in error) return String((error as { error: string }).error);
  return 'Something did not quite work. Please try again.';
};

const statusLabel = (status: RsvpStatus) => status === 'attending' ? 'Attending' : status === 'not_attending' ? 'Unable to attend' : 'Awaiting reply';
const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const memorialPortrait = '/memorial-main.jpg';

function downloadCalendar(event: Event, kind: 'wakeKeep' | 'burial') {
  const occurrence = event[kind];
  if (!occurrence.isoStart || !occurrence.isoEnd) return;
  const start = occurrence.isoStart.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = occurrence.isoEnd.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pa Emmanuel Memorial//EN',
    'BEGIN:VEVENT',
    `UID:${kind}-pa-emmanuel-2026@memorial`,
    `DTSTAMP:${start}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${event.title} — ${occurrence.label}`,
    `LOCATION:${occurrence.venue}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pa-emmanuel-${kind}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" data-testid="link-wordmark" className={`group inline-flex items-center gap-3 ${light ? 'text-[hsl(var(--sidebar-foreground))]' : 'text-foreground'}`}>
      <span className={`h-10 w-10 overflow-hidden rounded-full border p-0.5 ${light ? 'border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/10' : 'border-primary/20 bg-primary'}`}>
        <img src={memorialPortrait} alt="Pa Emmanuel Ayodele Abatan" className="h-full w-full rounded-full object-cover object-top" />
      </span>
      <span className="leading-tight">
        <span className="block text-[10px] font-semibold uppercase tracking-[.28em] opacity-70">A family memorial</span>
        <span className="serif text-xl">Pa Emmanuel</span>
      </span>
    </Link>
  );
}

function LoadingPanel({ label = 'Gathering the details…' }: { label?: string }) {
  return (
    <div className="min-h-[45vh] grid place-items-center bg-background px-6" data-testid="state-loading">
      <div className="text-center">
        <div className="mx-auto mb-5 h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <p className="mono text-[11px] uppercase tracking-[.2em] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ErrorPanel({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="mx-auto my-16 max-w-lg border border-destructive/30 bg-destructive/5 p-8 text-center" data-testid="state-error">
      <p className="mono mb-3 text-[11px] uppercase tracking-[.18em] text-destructive">A quiet interruption</p>
      <h2 className="serif text-3xl">We could not open this page.</h2>
      <p className="mt-3 text-sm text-muted-foreground">{errorMessage(error)}</p>
      <button type="button" onClick={onRetry} data-testid="button-retry" className="mt-6 border border-primary px-5 py-2 text-xs font-semibold uppercase tracking-[.14em] transition-transform hover:-translate-y-0.5">Try again</button>
    </div>
  );
}

function PublicHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-12">
      <Wordmark light />
      <nav className="hidden items-center gap-7 text-[11px] font-semibold uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground))]/70 sm:flex">
        <a href="#service" data-testid="link-service" className="transition-colors hover:text-[hsl(var(--accent))]">The service</a>
        <a href="#details" data-testid="link-details" className="transition-colors hover:text-[hsl(var(--accent))]">Details</a>
        <Link href="/check-in" data-testid="link-check-in" className="transition-colors hover:text-[hsl(var(--accent))]">Check in</Link>
        <Link href="/admin" data-testid="link-header-admin" className="transition-colors hover:text-[hsl(var(--accent))]">Admin dashboard</Link>
      </nav>
      <div className="flex items-center gap-2 sm:hidden">
        <Link href="/admin" data-testid="link-header-admin-mobile" className="rounded-full border border-[hsl(var(--sidebar-foreground))]/25 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[hsl(var(--sidebar-foreground))] transition-colors hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]">Admin</Link>
        <Link href="/check-in" data-testid="link-header-check-in" className="rounded-full border border-[hsl(var(--sidebar-foreground))]/25 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[hsl(var(--sidebar-foreground))] transition-colors hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]">Check in</Link>
      </div>
    </header>
  );
}

function EventDetails({ event }: { event: Event }) {
  const occurrence = (item: Event['wakeKeep'], key: string) => (
    <div className="border-l border-accent pl-5" data-testid={`event-occurrence-${key}`}>
      <p className="mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">{item.label}</p>
      <p className="serif mt-2 text-2xl text-primary">{item.date}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{item.time}</p>
    </div>
  );
  return (
    <section id="details" className="relative bg-background px-5 py-20 sm:px-8 lg:px-12 lg:py-28" data-testid="section-event-details">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-24">
          <div>
            <p className="mono text-[10px] uppercase tracking-[.22em] text-muted-foreground">The gathering</p>
            <h2 className="serif mt-4 text-5xl leading-[.95] text-primary sm:text-6xl">A life well<br /><em>remembered.</em></h2>
            <p className="mt-7 max-w-sm text-sm leading-7 text-muted-foreground">We invite you to stand with the Abatan family as we celebrate the life, love, and legacy of {event.name}.</p>
            <div className="mt-9 h-px w-20 bg-accent" />
          </div>
          <div className="space-y-10">
            <div className="grid gap-8 border-y border-border py-8 sm:grid-cols-2">
              {occurrence(event.wakeKeep, 'wake-keep')}
              {occurrence(event.burial, 'burial')}
            </div>
             <div className="grid gap-8 sm:grid-cols-2">
               {[event.wakeKeep, event.burial].map((item) => <div className="flex gap-4" data-testid={`event-venue-${item.label.toLowerCase().replaceAll(' ', '-')}`} key={item.label}><MapPin className="mt-1 size-5 shrink-0 text-accent" strokeWidth={1.5} /><div><p className="mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">{item.label} venue</p><p className="mt-2 text-sm leading-6">{item.venue}</p><a className="mt-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.1em] text-primary underline decoration-accent underline-offset-4" href={item.directionsUrl} target="_blank" rel="noreferrer" data-testid={`link-directions-${item.label.toLowerCase().replaceAll(' ', '-')}`}>Open directions <ArrowRight className="size-3" /></a></div></div>)}
             </div>
             <div className="flex gap-4" data-testid="event-dress-code"><Sparkles className="mt-1 size-5 shrink-0 text-accent" strokeWidth={1.5} /><div><p className="mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Dress code</p><p className="mt-2 text-sm leading-6">{event.dressCode}</p></div></div>
             <div className="grid gap-4 sm:grid-cols-2" data-testid="section-memorial-photos">{event.photos.map((photo, index) => <img key={photo} src={photo} alt={`${event.name} memorial photograph ${index + 1}`} className="max-h-[34rem] w-full bg-primary object-contain" />)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomePage() {
  const eventQuery = useGetEvent({ query: { queryKey: getGetEventQueryKey() } });
  if (eventQuery.isLoading) return <LoadingPanel />;
  if (eventQuery.isError || !eventQuery.data) return <ErrorPanel error={eventQuery.error} onRetry={() => eventQuery.refetch()} />;
  const event = eventQuery.data;
  return (
    <div className="paper-grain min-h-[100dvh] bg-background">
      <section className="relative flex min-h-[min(780px,100dvh)] items-end overflow-hidden bg-primary px-5 pb-16 pt-32 text-primary-foreground sm:px-8 lg:px-12">
        <PublicHeader />
        <div className="absolute -right-24 -top-28 size-[480px] rounded-full border border-accent/20" />
        <div className="absolute -right-8 -top-12 size-[320px] rounded-full border border-accent/15" />
        <div className="absolute bottom-0 right-[12%] hidden h-[70%] w-px bg-accent/20 lg:block" />
        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-14 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
          <div className="max-w-3xl">
             <p className="mono reveal-up text-[11px] uppercase tracking-[.3em] text-accent">In loving memory</p>
            <h1 className="serif reveal-up reveal-delay-1 mt-6 text-[clamp(4rem,12vw,9.5rem)] leading-[.78] tracking-[-.04em]">{event.name}</h1>
            <p className="reveal-up reveal-delay-2 mt-9 max-w-lg text-base leading-7 text-primary-foreground/70">{event.title}. A quiet invitation to gather, to pray, and to share the stories that keep a beloved life close.</p>
            <a href="#details" data-testid="link-scroll-details" className="reveal-up reveal-delay-3 mt-9 inline-flex items-center gap-3 border-b border-accent pb-2 text-xs font-semibold uppercase tracking-[.18em] text-accent">See the details <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></a>
          </div>
          <div className="reveal-up reveal-delay-4 max-w-sm justify-self-end">
            <div className="border border-primary-foreground/15 bg-primary-foreground/5 p-3 backdrop-blur-sm">
              <img src={memorialPortrait} alt={`Portrait of ${event.name}`} className="max-h-[26rem] w-full bg-[#e6dfd2] object-contain object-top" data-testid="img-home-memorial-portrait" />
              <p className="px-2 pb-2 pt-3 text-[10px] uppercase tracking-[.18em] text-primary-foreground/60">Remembered with love</p>
            </div>
            <div className="mt-5 border border-primary-foreground/15 bg-primary-foreground/5 p-7 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-primary-foreground/15 pb-5"><span className="mono text-[10px] uppercase tracking-[.22em] text-primary-foreground/60">You are remembered</span><Heart className="size-4 text-accent" fill="currentColor" /></div>
              <p className="serif mt-6 text-3xl leading-tight">“The measure of a life is not in its length, but in the love it leaves behind.”</p>
              <p className="mt-5 text-xs uppercase tracking-[.12em] text-primary-foreground/50">— Family of Pa Emmanuel</p>
            </div>
          </div>
        </div>
      </section>
      <EventDetails event={event} />
      <section id="service" className="border-t border-border bg-secondary/50 px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="mono text-[10px] uppercase tracking-[.22em] text-muted-foreground">A note for guests</p><p className="serif mt-3 text-3xl text-primary">Your presence is the greatest gift.</p></div>
          <Link href="/check-in" data-testid="link-check-in-cta" className="inline-flex items-center justify-center gap-3 bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-[.16em] text-primary-foreground transition-transform hover:-translate-y-1">Check in at the service <ArrowRight className="size-4 text-accent" /></Link>
        </div>
      </section>
      <footer className="flex flex-col gap-4 bg-primary px-5 py-8 text-primary-foreground/60 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"><Wordmark light /><p className="mono text-[10px] uppercase tracking-[.15em]">A family invitation · Pa Emmanuel Ayodele Abatan</p></footer>
    </div>
  );
}

function InvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const invitationQuery = useGetInvitation(token, { query: { enabled: Boolean(token), queryKey: getGetInvitationQueryKey(token) } });
  const rsvp = useUpdateRsvp();
  const selfCheckIn = useCheckInInvitation({
    mutation: {
      onSuccess: (result) => {
        if (result.result === 'successful' || result.result === 'already_checked_in') {
          queryClient.setQueryData(getGetInvitationQueryKey(token), {
            ...invite,
            checkedIn: true,
            checkedInAt: result.checkedInAt,
          });
        }
      },
    },
  });
  if (invitationQuery.isLoading) return <LoadingPanel label="Preparing your invitation…" />;
  if (invitationQuery.isError || !invitationQuery.data) return <ErrorPanel error={invitationQuery.error} onRetry={() => invitationQuery.refetch()} />;
  const invite = invitationQuery.data;
  const event = invite.event;
  const saveRsvp = (status: 'attending' | 'not_attending') => rsvp.mutate({ token, data: { status } }, {
    onSuccess: (next) => {
      queryClient.setQueryData(getGetInvitationQueryKey(token), next);
      queryClient.invalidateQueries({ queryKey: getGetEventQueryKey() });
    },
  });
  return (
    <div className="paper-grain min-h-[100dvh] bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-12"><Wordmark /><div className="flex items-center gap-4"><Link href="/admin" data-testid="link-invite-admin" className="text-[10px] font-semibold uppercase tracking-[.15em] text-muted-foreground transition-colors hover:text-primary">Admin dashboard</Link><Link href="/" data-testid="link-invite-home" className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.17em] text-muted-foreground"><ChevronLeft className="size-4" /> Home</Link></div></div>
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-12 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden bg-primary px-7 py-14 text-primary-foreground sm:px-14 sm:py-20">
          <div className="absolute -right-20 -top-28 size-72 rounded-full border border-accent/20" />
          <div className="relative grid gap-8 sm:grid-cols-[1fr_.48fr] sm:items-center">
            <div className="max-w-2xl">
              <p className="mono text-[10px] uppercase tracking-[.26em] text-accent">A personal invitation for</p>
              <h1 className="serif mt-5 text-6xl leading-[.88] sm:text-8xl" data-testid="text-invite-name">{invite.name}</h1>
              <p className="mt-8 text-sm leading-7 text-primary-foreground/70">The family of <span className="text-primary-foreground">{event.name}</span> would be honoured by your presence as we gather in remembrance.</p>
            </div>
            <div className="border border-primary-foreground/20 bg-primary-foreground/10 p-2">
              <img src={memorialPortrait} alt={`Portrait of ${event.name}`} className="max-h-64 w-full bg-[#e6dfd2] object-contain object-top sm:max-h-72" data-testid="img-invitation-memorial-portrait" />
            </div>
          </div>
        </div>
        <section className="grid gap-10 border-x border-b border-border p-7 sm:grid-cols-[1fr_.8fr] sm:p-12">
          <div>
            <p className="mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Your response</p>
            <h2 className="serif mt-3 text-4xl text-primary">Will you join us?</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">A response helps the family and our ushers prepare a place for you.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" disabled={rsvp.isPending} onClick={() => saveRsvp('attending')} data-testid="button-rsvp-attending" className={`inline-flex items-center justify-center gap-2 border px-5 py-3 text-xs font-semibold uppercase tracking-[.13em] transition-colors ${invite.rsvpStatus === 'attending' ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary'}`}>{invite.rsvpStatus === 'attending' && <Check className="size-4" />} I will be there</button>
              <button type="button" disabled={rsvp.isPending} onClick={() => saveRsvp('not_attending')} data-testid="button-rsvp-decline" className={`border px-5 py-3 text-xs font-semibold uppercase tracking-[.13em] transition-colors ${invite.rsvpStatus === 'not_attending' ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary'}`}>I cannot attend</button>
            </div>
             <div className="mt-7 border-t border-border pt-6"><p className="text-xs leading-5 text-muted-foreground">Arriving at the service? You can check yourself in from this private invitation.</p><button type="button" onClick={() => selfCheckIn.mutate({ token })} disabled={selfCheckIn.isPending || invite.checkedIn} data-testid="button-self-check-in" className="mt-3 inline-flex items-center gap-2 bg-primary px-5 py-3 text-xs font-semibold uppercase tracking-[.13em] text-primary-foreground disabled:opacity-60">{selfCheckIn.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4 text-accent" />}{invite.checkedIn ? 'Already checked in' : 'Check in'}</button>{selfCheckIn.isError && <p className="mt-3 text-xs text-destructive">{errorMessage(selfCheckIn.error)}</p>}{(selfCheckIn.data || invite.checkedIn) && <p className="mt-3 text-xs text-primary" data-testid="status-self-check-in">{selfCheckIn.data?.result === 'already_checked_in' || invite.checkedIn ? 'Already Checked In' : 'Check-in successful'}{(selfCheckIn.data?.checkedInAt || invite.checkedInAt) && ` · ${new Date(selfCheckIn.data?.checkedInAt || invite.checkedInAt || '').toLocaleString('en-GB')}`}</p>}</div>
            {rsvp.isError && <p className="mt-4 text-xs text-destructive" data-testid="status-rsvp-error">{errorMessage(rsvp.error)}</p>}
            {invite.rsvpStatus !== 'pending' && <p className="mt-5 text-xs text-muted-foreground" data-testid="status-rsvp">Your response: <strong className="text-foreground">{statusLabel(invite.rsvpStatus)}</strong></p>}
          </div>
          <div className="border-l border-accent pl-6">
            <p className="mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Gathering details</p>
             <div className="mt-5 space-y-6">
              <div><p className="text-xs uppercase tracking-[.1em] text-muted-foreground">{event.wakeKeep.label}</p><p className="serif mt-1 text-2xl text-primary">{event.wakeKeep.date}</p><p className="text-sm">{event.wakeKeep.time}</p></div>
              <div><p className="text-xs uppercase tracking-[.1em] text-muted-foreground">{event.burial.label}</p><p className="serif mt-1 text-2xl text-primary">{event.burial.date}</p><p className="text-sm">{event.burial.time}</p></div>
               <div><p className="text-xs uppercase tracking-[.1em] text-muted-foreground">Wake keep venue</p><p className="mt-1 text-sm leading-6">{event.wakeKeep.venue}</p><p className="mt-4 text-xs uppercase tracking-[.1em] text-muted-foreground">Burial venue</p><p className="mt-1 text-sm leading-6">{event.burial.venue}</p></div>
            </div>
             <div className="mt-7 flex flex-wrap gap-2">
               <button type="button" onClick={() => downloadCalendar(event, 'wakeKeep')} data-testid="button-calendar-wake-keep" className="border border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-[.11em] transition-colors hover:border-primary">Add wake keep</button>
               <button type="button" onClick={() => downloadCalendar(event, 'burial')} data-testid="button-calendar-burial" className="border border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-[.11em] transition-colors hover:border-primary">Add burial</button>
             </div>
          </div>
        </section>
         <div className="flex flex-col gap-4 border-b border-border px-7 py-6 sm:px-12"><p className="text-sm text-muted-foreground">Keep this invitation close for arrival.</p><div className="flex flex-wrap gap-4"><a href={event.wakeKeep.directionsUrl} target="_blank" rel="noreferrer" data-testid="link-invite-wake-directions" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-primary"><MapPin className="size-4 text-accent" /> Wake directions</a><a href={event.burial.directionsUrl} target="_blank" rel="noreferrer" data-testid="link-invite-burial-directions" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-primary"><MapPin className="size-4 text-accent" /> Burial directions</a><button type="button" data-testid="button-copy-invitation" onClick={() => navigator.clipboard?.writeText(invite.invitationUrl)} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-primary"><Copy className="size-4 text-accent" /> Copy invitation link</button></div></div>
      </main>
    </div>
  );
}

function UsherAccess({ onLoggedIn }: { onLoggedIn: () => void }) {
  const login = useUsherLogin();
  const queryClient = useQueryClient();
  const [accessCode, setAccessCode] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ data: { accessCode } }, {
      onSuccess: (session) => {
        queryClient.setQueryData(getGetUsherSessionQueryKey(), session);
        onLoggedIn();
      },
    });
  };
  return <div className="paper-grain grid min-h-[100dvh] place-items-center bg-background px-5"><div className="w-full max-w-md border border-border bg-card p-7 sm:p-10"><Wordmark /><p className="mono mt-12 text-[10px] uppercase tracking-[.22em] text-muted-foreground">Welcome desk</p><h1 className="serif mt-4 text-5xl leading-[.9] text-primary">Usher access.</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">Enter the private welcome desk code to open the scanner.</p><form onSubmit={submit} className="mt-8"><label htmlFor="usher-access-code" className="mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Access code</label><input id="usher-access-code" inputMode="numeric" type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required autoComplete="off" data-testid="input-usher-access-code" className="mt-2 h-14 w-full border border-input bg-background px-4 font-mono text-xl tracking-[.2em] outline-none focus:border-primary" />{login.isError && <p className="mt-4 text-sm text-destructive" data-testid="status-usher-login-error">{errorMessage(login.error)}</p>}<button type="submit" disabled={login.isPending} data-testid="button-usher-login" className="mt-5 flex h-12 w-full items-center justify-center gap-2 bg-primary text-xs font-semibold uppercase tracking-[.16em] text-primary-foreground">{login.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4 text-accent" />} Open check-in desk</button></form><Link href="/" data-testid="link-usher-back" className="mt-7 inline-flex items-center gap-2 text-xs text-muted-foreground"><ChevronLeft className="size-4" /> Back to invitation</Link></div></div>;
}

function CheckInWorkspace() {
  const checkIn = useCheckInGuest();
  const usherLogout = useUsherLogout();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  useEffect(() => {
    if (!cameraOpen) return;
    setCameraError('');
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        setCode(decodedText);
        void scanner.stop().catch(() => undefined);
        scannerRef.current = null;
        setCameraOpen(false);
        checkIn.mutate({ data: { invitationCode: decodedText } });
      },
      () => undefined,
    ).catch(() => {
      setCameraError('Camera access was unavailable. Please allow camera access or enter the invitation code manually.');
      setCameraOpen(false);
    });
    return () => {
      void scanner.stop().catch(() => undefined);
      scannerRef.current = null;
    };
  }, [cameraOpen, checkIn]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (code.trim()) checkIn.mutate({ data: { invitationCode: code.trim() } }); };
  return (
    <div className="paper-grain min-h-[100dvh] bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-12"><Wordmark /><div className="flex items-center gap-4"><button type="button" onClick={() => usherLogout.mutate(undefined, { onSuccess: () => { queryClient.removeQueries({ queryKey: getGetUsherSessionQueryKey() }); window.location.reload(); } })} data-testid="button-usher-logout" className="text-[10px] font-semibold uppercase tracking-[.17em] text-muted-foreground">Sign out</button><Link href="/" data-testid="link-checkin-home" className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.17em] text-muted-foreground"><ChevronLeft className="size-4" /> Back</Link></div></div>
      <main className="mx-auto max-w-4xl px-5 pb-20 pt-10 sm:px-8 lg:px-12">
        <div className="mb-10 max-w-xl"><p className="mono text-[10px] uppercase tracking-[.22em] text-muted-foreground">Welcome desk</p><h1 className="serif mt-4 text-6xl leading-[.85] text-primary">Arrive with ease.</h1><p className="mt-5 text-sm leading-7 text-muted-foreground">Show your invitation code to an usher. We will mark your arrival with care.</p></div>
        <div className="grid gap-8 lg:grid-cols-[1fr_.9fr]">
          <section className="border border-border bg-card p-6 sm:p-9" data-testid="section-manual-checkin">
            <div className="flex items-center gap-3 border-b border-border pb-5"><Clipboard className="size-5 text-accent" /><div><h2 className="font-semibold">Enter invitation code</h2><p className="text-xs text-muted-foreground">Codes are case-sensitive.</p></div></div>
            <form onSubmit={submit} className="mt-8"><label htmlFor="invitation-code" className="mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Invitation code</label><input id="invitation-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. PA-EMMANUEL-7F2K" autoComplete="off" data-testid="input-invitation-code" className="mt-3 h-14 w-full border border-input bg-background px-4 font-mono text-lg tracking-[.14em] outline-none transition-colors focus:border-primary" /><button type="submit" disabled={checkIn.isPending || code.trim().length < 4} data-testid="button-submit-checkin" className="mt-4 flex h-12 w-full items-center justify-center gap-2 bg-primary text-xs font-semibold uppercase tracking-[.16em] text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50">{checkIn.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4 text-accent" />} Confirm arrival</button></form>
            {checkIn.isError && <div className="mt-6 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" data-testid="status-checkin-error">{errorMessage(checkIn.error)}</div>}
             {checkIn.data && <div className={`mt-6 border p-5 ${checkIn.data.result === 'invalid' ? 'border-destructive/30 bg-destructive/5' : 'border-accent/50 bg-accent/10'}`} data-testid="status-checkin-result"><p className="mono text-[10px] uppercase tracking-[.18em]">{checkIn.data.result === 'invalid' ? 'NOT RECOGNISED' : checkIn.data.result === 'already_checked_in' ? 'ALREADY CHECKED IN' : 'CHECK-IN SUCCESSFUL'}</p><p className="serif mt-2 text-2xl">{checkIn.data.guestName ? `Guest: ${checkIn.data.guestName}` : 'Please check the code and try again.'}</p>{checkIn.data.checkedInAt && <p className="mt-2 text-xs text-muted-foreground">Time: {new Date(checkIn.data.checkedInAt).toLocaleString('en-GB')}</p>}{checkIn.data.rsvpStatus && <p className="mt-2 text-xs text-muted-foreground">RSVP: {statusLabel(checkIn.data.rsvpStatus)}</p>}</div>}
          </section>
          <section className="border border-border bg-primary p-6 text-primary-foreground sm:p-9" data-testid="section-camera-checkin">
            <div className="flex items-center gap-3 border-b border-primary-foreground/15 pb-5"><Camera className="size-5 text-accent" /><div><h2 className="font-semibold">Scan at the door</h2><p className="text-xs text-primary-foreground/60">Use your device camera when available.</p></div></div>
            <div className="mt-8 overflow-hidden border border-primary-foreground/15 bg-primary-foreground/5">
               {cameraOpen ? <div id="qr-reader" className="min-h-64 w-full bg-black" data-testid="qr-reader" /> : <div className="grid aspect-video place-items-center"><Camera className="size-9 text-accent/60" strokeWidth={1} /></div>}
            </div>
            <button type="button" onClick={() => setCameraOpen((open) => !open)} data-testid="button-toggle-camera" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-accent">{cameraOpen ? <X className="size-4" /> : <Camera className="size-4" />}{cameraOpen ? 'Close camera' : 'Open camera'}</button>
             {cameraError && <p className="mt-5 text-xs leading-6 text-accent" data-testid="status-camera-error">{cameraError}</p>}
             <p className="mt-8 border-t border-primary-foreground/15 pt-5 text-xs leading-6 text-primary-foreground/60">Scanning is available on supported devices. An usher can always help you enter the code manually.</p>
          </section>
        </div>
      </main>
    </div>
  );
}

function CheckInPage() {
  const sessionQuery = useGetUsherSession({ query: { queryKey: getGetUsherSessionQueryKey(), retry: false } });
  const [, setLocation] = useLocation();
  if (sessionQuery.isLoading) return <LoadingPanel label="Opening the welcome desk…" />;
  if (!sessionQuery.data?.authenticated) return <UsherAccess onLoggedIn={() => setLocation('/check-in')} />;
  return <CheckInWorkspace />;
}

function AdminLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const login = useAdminLogin();
  const queryClient = useQueryClient();
  const [accessCode, setAccessCode] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ data: { accessCode } }, { onSuccess: (session) => { queryClient.setQueryData(getGetAdminSessionQueryKey(), session); onLoggedIn(); } });
  };
  return (
    <div className="paper-grain grid min-h-[100dvh] bg-primary lg:grid-cols-[.9fr_1.1fr]">
      <div className="hidden items-end p-12 text-primary-foreground lg:flex"><div><Wordmark light /><p className="serif mt-24 max-w-md text-6xl leading-[.88]">The people who remember are the keepers of a life.</p><p className="mt-8 max-w-sm text-sm leading-6 text-primary-foreground/60">A private workspace for the family and welcome desk.</p></div></div>
      <div className="flex items-center bg-background px-5 py-14 sm:px-12"><div className="w-full max-w-md"><div className="mb-12 lg:hidden"><Wordmark /></div><p className="mono text-[10px] uppercase tracking-[.22em] text-muted-foreground">Family workspace</p><h1 className="serif mt-4 text-5xl text-primary">Welcome back.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Enter the private family access code to manage invitations and welcome every guest.</p><form onSubmit={submit} className="mt-10 space-y-5"><div><label htmlFor="admin-access-code" className="mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Access code</label><input id="admin-access-code" inputMode="numeric" type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required autoComplete="off" data-testid="input-admin-access-code" className="mt-2 h-12 w-full border border-input bg-card px-4 font-mono tracking-[.2em] outline-none focus:border-primary" /></div>{login.isError && <p className="text-sm text-destructive" data-testid="status-login-error">{errorMessage(login.error)}</p>}<button type="submit" disabled={login.isPending} data-testid="button-admin-login" className="flex h-12 w-full items-center justify-center gap-2 bg-primary text-xs font-semibold uppercase tracking-[.16em] text-primary-foreground">{login.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4 text-accent" />} Enter workspace</button></form><Link href="/" data-testid="link-admin-back" className="mt-8 inline-flex items-center gap-2 text-xs text-muted-foreground"><ChevronLeft className="size-4" /> Return to public invitation</Link></div></div>
    </div>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className={`border p-5 ${accent ? 'border-accent bg-accent/10' : 'border-border bg-card'}`} data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}><p className="mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{label}</p><p className="serif mt-3 text-4xl text-primary">{value}</p></div>;
}

function GuestForm({ guest, onDone }: { guest?: Guest; onDone: () => void }) {
  const create = useCreateGuest();
  const update = useUpdateGuest();
  const queryClient = useQueryClient();
  const [name, setName] = useState(guest?.name ?? '');
  const [phone, setPhone] = useState(guest?.phone ?? '');
  const [email, setEmail] = useState(guest?.email ?? '');
  const pending = create.isPending || update.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const done = () => { queryClient.invalidateQueries({ queryKey: getListGuestsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); onDone(); };
    if (guest) update.mutate({ id: guest.id, data: { name: name.trim(), phone: phone.trim() || null, email: email.trim() || null } }, { onSuccess: done });
    else create.mutate({ data: { name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined } }, { onSuccess: done });
  };
  return <form onSubmit={submit} className="space-y-4" data-testid={guest ? 'form-edit-guest' : 'form-create-guest'}><div><label className="mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Full name</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} required data-testid="input-guest-name" className="mt-2 h-11 w-full border border-input bg-background px-3 outline-none focus:border-primary" /></div><div><label className="mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Phone <span className="normal-case tracking-normal">(optional)</span></label><input value={phone} onChange={(event) => setPhone(event.target.value)} data-testid="input-guest-phone" className="mt-2 h-11 w-full border border-input bg-background px-3 outline-none focus:border-primary" /></div><div><label className="mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Email <span className="normal-case tracking-normal">(optional)</span></label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} data-testid="input-guest-email" className="mt-2 h-11 w-full border border-input bg-background px-3 outline-none focus:border-primary" /></div>{(create.isError || update.isError) && <p className="text-xs text-destructive" data-testid="status-guest-form-error">{errorMessage(create.error || update.error)}</p>}<button type="submit" disabled={pending} data-testid={guest ? 'button-save-guest' : 'button-create-guest'} className="flex h-11 w-full items-center justify-center gap-2 bg-primary text-xs font-semibold uppercase tracking-[.14em] text-primary-foreground">{pending && <LoaderCircle className="size-4 animate-spin" />}{guest ? 'Save guest' : 'Create invitation'}</button></form>;
}

function GuestModal({ guest, onClose }: { guest?: Guest; onClose: () => void }) {
  return <div className="fixed inset-0 z-30 grid place-items-center bg-primary/60 p-4" role="dialog" aria-modal="true" data-testid="dialog-guest"><div className="w-full max-w-md border border-border bg-background p-6 shadow-xl sm:p-8"><div className="flex items-start justify-between"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">{guest ? 'Edit record' : 'New invitation'}</p><h2 className="serif mt-2 text-3xl text-primary">{guest ? 'Update guest' : 'Add a guest'}</h2></div><button type="button" onClick={onClose} data-testid="button-close-guest-modal" className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button></div><div className="mt-7"><GuestForm guest={guest} onDone={onClose} /></div></div></div>;
}

function GuestQrDialog({ guest, onClose }: { guest: Guest; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  useEffect(() => {
    void QRCode.toDataURL(guest.invitationUrl, {
      width: 560,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#172b25', light: '#f7f3eb' },
    }).then(setQrDataUrl);
  }, [guest.invitationUrl]);
  const print = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open('', '_blank', 'width=640,height=760');
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Invitation QR — ${guest.name}</title></head><body style="font-family:Arial,sans-serif;text-align:center;padding:32px"><h1>${guest.name}</h1><img src="${qrDataUrl}" alt="Invitation QR code" style="width:420px;max-width:100%"/><p>${guest.token}</p><script>window.onload=function(){window.print();}</script></body></html>`);
    printWindow.document.close();
  };
  return <div className="fixed inset-0 z-40 grid place-items-center bg-primary/70 p-4" role="dialog" aria-modal="true" data-testid="dialog-guest-qr"><div className="w-full max-w-md border border-border bg-background p-6 text-center shadow-xl sm:p-8"><div className="flex items-start justify-between text-left"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Private invitation code</p><h2 className="serif mt-2 text-3xl text-primary">{guest.name}</h2></div><button type="button" onClick={onClose} data-testid="button-close-qr-dialog"><X className="size-5 text-muted-foreground" /></button></div>{qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${guest.name}`} className="mx-auto mt-7 w-full max-w-[280px] border border-border p-3" data-testid="img-guest-qr" /> : <div className="mx-auto mt-7 grid aspect-square max-w-[280px] place-items-center border border-border"><LoaderCircle className="size-6 animate-spin text-accent" /></div>}<p className="mt-5 font-mono text-sm font-semibold text-primary" data-testid="text-guest-invitation-code">{guest.invitationCode}</p><p className="mt-2 break-all font-mono text-xs text-muted-foreground" data-testid="text-guest-token">{guest.token}</p><p className="mt-2 break-all text-xs text-muted-foreground" data-testid="text-guest-invitation-url">{guest.invitationUrl}</p><div className="mt-6 grid grid-cols-2 gap-2"><a href={qrDataUrl || undefined} download={`invitation-${guest.name.replace(/\s+/g, '-').toLowerCase()}.png`} onClick={(event) => { if (!qrDataUrl) event.preventDefault(); }} data-testid="button-download-qr" className="border border-primary px-3 py-3 text-xs font-semibold uppercase tracking-[.11em]">Download QR</a><button type="button" onClick={print} disabled={!qrDataUrl} data-testid="button-print-qr" className="bg-primary px-3 py-3 text-xs font-semibold uppercase tracking-[.11em] text-primary-foreground disabled:opacity-50">Print QR</button></div></div></div>;
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const preview = usePreviewGuestImport();
  const importer = useImportGuests();
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState('name,phone,email\n');
  const doPreview = () => preview.mutate({ data: { csvText: csv } });
  const doImport = () => importer.mutate({ data: { csvText: csv } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListGuestsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); onClose(); } });
  return <div className="fixed inset-0 z-30 grid place-items-center bg-primary/60 p-4" role="dialog" aria-modal="true" data-testid="dialog-import"><div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto border border-border bg-background p-6 shadow-xl sm:p-8"><div className="flex items-start justify-between"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Guest list</p><h2 className="serif mt-2 text-3xl text-primary">Import guests</h2></div><button type="button" onClick={onClose} data-testid="button-close-import-modal"><X className="size-5 text-muted-foreground" /></button></div><p className="mt-3 text-sm text-muted-foreground">Paste CSV or spreadsheet data below. Tabs, commas, and headers for name, phone, and email are supported.</p><textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={7} data-testid="textarea-guest-csv" className="mt-6 w-full border border-input bg-card p-3 font-mono text-xs outline-none focus:border-primary" />{preview.data && <div className="mt-4 border border-border p-4" data-testid="section-import-preview"><div className="flex flex-wrap gap-5 text-xs"><span><strong className="text-primary">{preview.data.validCount}</strong> valid</span><span><strong className="text-destructive">{preview.data.invalidCount}</strong> invalid</span><span><strong>{preview.data.duplicateCount}</strong> duplicates</span></div><div className="mt-4 max-h-40 overflow-auto text-xs">{preview.data.rows.map((row) => <div key={row.rowNumber} className="flex justify-between border-t border-border py-2"><span>{row.rowNumber}. {row.name || 'Unnamed'}</span><span className={row.valid && !row.duplicate ? 'text-primary' : 'text-destructive'}>{row.error || (row.duplicate ? 'Duplicate' : 'Ready')}</span></div>)}</div></div>}{(preview.isError || importer.isError) && <p className="mt-4 text-xs text-destructive" data-testid="status-import-error">{errorMessage(preview.error || importer.error)}</p>}<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} data-testid="button-cancel-import" className="h-11 border border-border px-5 text-xs font-semibold uppercase tracking-[.12em]">Cancel</button><button type="button" onClick={doPreview} disabled={preview.isPending || !csv.trim()} data-testid="button-preview-import" className="h-11 border border-primary px-5 text-xs font-semibold uppercase tracking-[.12em]">{preview.isPending ? 'Checking…' : 'Preview rows'}</button>{preview.data && <button type="button" onClick={doImport} disabled={importer.isPending || preview.data.validCount === 0} data-testid="button-confirm-import" className="h-11 bg-primary px-5 text-xs font-semibold uppercase tracking-[.12em] text-primary-foreground">{importer.isPending ? 'Importing…' : 'Import guests'}</button>}</div></div></div>;
}

function AdminWorkspace({ onLogout }: { onLogout: () => void }) {
  const queryClient = useQueryClient();
  const dashboard = useGetAdminDashboard({ query: { queryKey: getGetAdminDashboardQueryKey() } });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'checked_in' | 'not_checked_in'>('all');
  const guestsQuery = useListGuests({ search: search || undefined, checkInStatus: filter }, { query: { queryKey: getListGuestsQueryKey({ search: search || undefined, checkInStatus: filter }) } });
  const selectedIdState = useState<number | null>(null);
  const [selectedId, setSelectedId] = selectedIdState;
  const [modal, setModal] = useState<'create' | 'import' | null>(null);
  const [qrGuest, setQrGuest] = useState<Guest | null>(null);
  const deleteGuest = useDeleteGuest();
  const selectedGuestQuery = useGetGuest(selectedId ?? 0, { query: { enabled: selectedId !== null, queryKey: getGetGuestQueryKey(selectedId ?? 0) } });
  const guests = guestsQuery.data ?? [];
  const selectedGuest = selectedGuestQuery.data;
  const doDelete = (guest: Guest) => { if (window.confirm(`Remove ${guest.name} from the guest list?`)) deleteGuest.mutate({ id: guest.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListGuestsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); } }); };
  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-primary p-7 text-primary-foreground md:fixed md:inset-y-0 md:flex"><Wordmark light /><div className="mt-auto"><p className="mono text-[10px] uppercase tracking-[.18em] text-primary-foreground/50">Administrator</p><button type="button" onClick={onLogout} data-testid="button-admin-logout" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-primary-foreground/70 hover:text-accent"><LogOut className="size-4" /> Sign out</button></div></aside>
      <main className="md:ml-64"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-5 py-5 backdrop-blur sm:px-8"><div className="md:hidden"><Wordmark /></div><div className="hidden md:block"><p className="mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Family workspace</p><p className="serif text-2xl text-primary">The guest book</p></div><div className="flex items-center gap-3"><Link href="/" data-testid="link-admin-public" className="hidden text-xs text-muted-foreground sm:inline">View invitation</Link><button type="button" onClick={onLogout} data-testid="button-admin-logout-mobile" className="inline-flex items-center gap-2 border border-border px-3 py-2 text-xs font-semibold uppercase tracking-[.12em] md:hidden"><LogOut className="size-4" /> Exit</button></div></header>
        <div className="mx-auto max-w-7xl space-y-8 px-5 py-8 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Overview</p><h1 className="serif mt-2 text-5xl text-primary">A warm welcome, counted.</h1></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setModal('import')} data-testid="button-open-import" className="inline-flex items-center gap-2 border border-border px-4 py-3 text-xs font-semibold uppercase tracking-[.12em]"><FileUp className="size-4 text-accent" /> Import CSV</button><button type="button" onClick={() => setModal('create')} data-testid="button-open-create-guest" className="inline-flex items-center gap-2 bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-[.12em] text-primary-foreground"><Plus className="size-4 text-accent" /> Add guest</button></div></div>
          {dashboard.isLoading ? <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{[1,2,3,4,5,6].map((item) => <div key={item} className="skeleton h-28" />)}</div> : dashboard.isError ? <ErrorPanel error={dashboard.error} onRetry={() => dashboard.refetch()} /> : dashboard.data && <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><StatCard label="Total guests" value={dashboard.data.totalGuests} /><StatCard label="Attending" value={dashboard.data.attending} accent /><StatCard label="Awaiting reply" value={dashboard.data.pendingRsvp} /><StatCard label="Unable to attend" value={dashboard.data.notAttending} /><StatCard label="Checked in" value={dashboard.data.checkedIn} accent /><StatCard label="Not checked in" value={dashboard.data.notCheckedIn} /></div>}
           <section className="border border-border bg-card" data-testid="section-guest-management">
             <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
               <div><h2 className="serif text-3xl text-primary">Guest list</h2><p className="mt-1 text-xs text-muted-foreground">{guests.length} invitation{guests.length === 1 ? '' : 's'} in view</p></div>
               <div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guests" data-testid="input-guest-search" className="h-10 w-full border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-52" /></div><label className="relative"><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} data-testid="select-checkin-filter" className="h-10 w-full appearance-none border border-input bg-background px-3 pr-9 text-xs font-semibold uppercase tracking-[.1em] outline-none sm:w-44"><option value="all">All arrivals</option><option value="checked_in">Checked in</option><option value="not_checked_in">Not checked in</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /></label></div>
             </div>
             {guestsQuery.isLoading ? <div className="space-y-2 p-5">{[1,2,3,4].map((item) => <div key={item} className="skeleton h-16" />)}</div> : guestsQuery.isError ? <ErrorPanel error={guestsQuery.error} onRetry={() => guestsQuery.refetch()} /> : guests.length === 0 ? <div className="p-12 text-center" data-testid="state-guests-empty"><Users className="mx-auto size-8 text-accent" /><p className="serif mt-4 text-2xl text-primary">No guests here yet.</p><p className="mt-2 text-sm text-muted-foreground">Add someone by hand or import your list.</p></div> : <div className="divide-y divide-border">{guests.map((guest) => <div key={guest.id} className="flex flex-col gap-4 p-5 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-guest-${guest.id}`}><div className="flex items-center gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-semibold text-primary">{initials(guest.name)}</span><div><p className="font-semibold" data-testid={`text-guest-name-${guest.id}`}>{guest.name}</p><p className="mt-1 text-xs text-muted-foreground">{guest.email || guest.phone || 'No contact details'}</p><p className="mt-1 font-mono text-[10px] text-primary" data-testid={`text-guest-code-${guest.id}`}>{guest.invitationCode}<button type="button" onClick={() => void navigator.clipboard?.writeText(guest.invitationCode)} data-testid={`button-copy-guest-code-${guest.id}`} className="ml-2 text-muted-foreground underline">Copy code</button></p></div></div><div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end"><span className={`text-xs ${guest.rsvpStatus === 'attending' ? 'text-primary' : 'text-muted-foreground'}`} data-testid={`status-guest-rsvp-${guest.id}`}>{guest.rsvpStatus === 'attending' && <CheckCircle2 className="mr-1 inline size-3" />}{statusLabel(guest.rsvpStatus)}</span><span className={`mono text-[10px] uppercase tracking-[.12em] ${guest.checkedIn ? 'text-primary' : 'text-muted-foreground'}`} data-testid={`status-guest-checkin-${guest.id}`}>{guest.checkedIn ? 'Arrived' : 'Not arrived'}</span><button type="button" onClick={() => setQrGuest(guest)} data-testid={`button-view-qr-${guest.id}`} className="p-2 text-muted-foreground hover:text-primary" title="View QR"><span className="font-mono text-[10px] font-semibold">QR</span></button><button type="button" onClick={() => void navigator.clipboard?.writeText(guest.invitationUrl)} data-testid={`button-copy-guest-link-${guest.id}`} className="p-2 text-muted-foreground hover:text-primary" title="Copy invitation link"><Copy className="size-4" /></button><button type="button" onClick={() => setSelectedId(guest.id)} data-testid={`button-edit-guest-${guest.id}`} className="p-2 text-muted-foreground hover:text-primary"><Pencil className="size-4" /></button><button type="button" onClick={() => doDelete(guest)} disabled={deleteGuest.isPending} data-testid={`button-delete-guest-${guest.id}`} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button></div></div>)}</div>}
           </section>
        </div>
      </main>
      {modal === 'create' && <GuestModal onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {selectedId !== null && selectedGuestQuery.isLoading && <div className="fixed inset-0 z-30 grid place-items-center bg-primary/60 p-4" data-testid="state-loading-guest"><div className="bg-background p-8 text-center"><LoaderCircle className="mx-auto size-6 animate-spin text-accent" /><p className="mt-3 text-xs uppercase tracking-[.14em] text-muted-foreground">Opening guest record</p></div></div>}
       {selectedId !== null && selectedGuest && <GuestModal guest={selectedGuest} onClose={() => setSelectedId(null)} />}
       {qrGuest && <GuestQrDialog guest={qrGuest} onClose={() => setQrGuest(null)} />}
    </div>
  );
}

function AdminPage() {
  const sessionQuery = useGetAdminSession({ query: { queryKey: getGetAdminSessionQueryKey(), retry: false } });
  const [, setLocation] = useLocation();
  const logout = useAdminLogout();
  if (sessionQuery.isLoading) return <LoadingPanel label="Checking the family workspace…" />;
  if (!sessionQuery.data?.authenticated) return <AdminLogin onLoggedIn={() => setLocation('/admin')} />;
  return <AdminWorkspace onLogout={() => logout.mutate(undefined, { onSuccess: () => { queryClient.removeQueries({ queryKey: getGetAdminSessionQueryKey() }); setLocation('/admin'); } })} />;
}

function NotFound() {
  return <div className="grid min-h-[100dvh] place-items-center bg-background p-6 text-center"><div><p className="mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">404 · page not found</p><h1 className="serif mt-4 text-6xl text-primary">A missing page.</h1><Link href="/" data-testid="link-notfound-home" className="mt-7 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.15em] text-primary underline decoration-accent underline-offset-4">Return home <ArrowRight className="size-4" /></Link></div></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={HomePage} /><Route path="/invite/:token" component={InvitePage} /><Route path="/check-in" component={CheckInPage} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;