import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/components/theme-provider';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Shield,
  Palette,
  MessageSquare,
  Bell,
  Calendar,
  Gamepad2,
  Users,
  Moon,
  Sun,
  Lock,
  Eye,
  UserPlus,
  Copy,
  Loader2,
} from 'lucide-react';
import { CHAT_BACKGROUNDS, type ChatBackgroundKey } from '@/lib/chatBackgrounds';
import { applyUiFont, DEFAULT_UI_FONT, UI_FONT_OPTIONS, type UiFont } from '@/lib/fonts';
import {
  AVAILABLE_ANIMATIONS,
  DEFAULT_WORD_ANIMATIONS,
  type AnimationKey,
  type WordAnimation,
} from '@/lib/wordAnimations';

type UiSettingsState = {
  animationsEnabled: boolean;
  selectedFont: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  chatBackground: ChatBackgroundKey;
  theme: string;
  memoriesVisibleForGuests: boolean;
  commentsAllowedForGuests: boolean;
  soundNotifications: boolean;
  eventReminders: boolean;
  calendarIntegration: boolean;
  gameSounds: boolean;
  wordAnimations: WordAnimation[];
  invitePlaceholder: string;
  uiLang: 'ru' | 'en';
  stopWord?: string;
  truthQuestions?: string[];
  dareActions?: string[];
  guessQuestions?: string[];
  relationshipStartDate?: string;
};

type ServerSettings = {
  theme?: 'light' | 'dark';
  language?: string;
  animations?: boolean;
  font?: UiFont;
  chatBackground?: ChatBackgroundKey;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  privacy?: {
    guestCanViewMemories?: boolean;
    guestCanComment?: boolean;
    guestCanPlayGames?: boolean;
  };
  soundNotifications?: boolean;
  eventReminders?: boolean;
  calendarIntegration?: boolean;
  relationshipStartDate?: string;
  gameSounds?: boolean;
  wordAnimations?: WordAnimation[];
  invitePlaceholder?: string;
  stopWord?: string;
  truthQuestions?: string[];
  dareActions?: string[];
  guessQuestions?: string[];
  uiLang?: 'ru' | 'en';
};

type CoupleSettingsPayload = {
  theme: string;
  animations: boolean;
  font: string;
  chatBackground: ChatBackgroundKey;
  emailNotifications: boolean;
  pushNotifications: boolean;
  soundNotifications: boolean;
  eventReminders: boolean;
  calendarIntegration: boolean;
  gameSounds: boolean;
  wordAnimations: WordAnimation[];
  invitePlaceholder: string;
  uiLang: 'ru' | 'en';
  stopWord: string;
  chatPassword?: string;
  truthQuestions: string[];
  dareActions: string[];
  guessQuestions: string[];
  privacy: {
    guestCanViewMemories: boolean;
    guestCanComment: boolean;
  };
  relationshipStartDate: string;
};

export default function SettingsPage() {
  type Counter = { id: string; name: string; value: number; date?: string };
  const [counters, setCounters] = useState<Counter[]>([]);
  const [newCounterName, setNewCounterName] = useState('');
  const [newCounterValue, setNewCounterValue] = useState<number | ''>('');
  const [newCounterDate, setNewCounterDate] = useState('');
    const [uiLang, setUiLang] = useState<'ru' | 'en'>(localStorage.getItem('ui:lang') === 'en' ? 'en' : 'ru');
    useEffect(() => {
      if (baselineRef.current && typeof baselineRef.current.uiLang === 'undefined') {
        baselineRef.current.uiLang = uiLang;
      }
    }, [uiLang]);

  useEffect(() => {
    if (!defaultsRef.current && baselineRef.current) {
      defaultsRef.current = { ...baselineRef.current, uiLang };
      try {
        localStorage.setItem('ui:defaultsSettings', JSON.stringify(defaultsRef.current));
      } catch {}
    }
  }, [uiLang]);

  useEffect(() => {
    function updateFromStorage(_e?: StorageEvent | CustomEvent) {
      try {
        setChatBackground((localStorage.getItem('ui:chatBackground') as ChatBackgroundKey) || 'none');
        setSelectedFont(localStorage.getItem('ui:font') || DEFAULT_UI_FONT);
        setWordAnimations(JSON.parse(localStorage.getItem('ui:wordAnimations') || '[]'));
      } catch {}
    }
    function onStorage(e: StorageEvent) {
      if (e.key && e.key.startsWith('ui:')) updateFromStorage(e);
    }
    function onCustom(e: Event) {
      const ce = e as CustomEvent<{ key: string }>;
      if (ce.detail?.key && ce.detail.key.startsWith('ui:')) updateFromStorage();
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('uiSettingsChanged', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('uiSettingsChanged', onCustom as EventListener);
    };
  }, []);
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [selectedFont, setSelectedFont] = useState<string>(DEFAULT_UI_FONT);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [memoriesVisibleForGuests, setMemoriesVisibleForGuests] = useState(false);
  const [commentsAllowedForGuests, setCommentsAllowedForGuests] = useState(true);
  const [soundNotifications, setSoundNotifications] = useState(true);
  const [eventReminders, setEventReminders] = useState(true);
  const [calendarIntegration, setCalendarIntegration] = useState(false);
  const [relationshipStartDate, setRelationshipStartDate] = useState<string>('');
  const { data: settingsData } = useQuery<{ settings?: ServerSettings }>({
    queryKey: ['/api/settings'],
  });

  useEffect(() => {
    if (settingsData?.settings?.relationshipStartDate) {
      setRelationshipStartDate(settingsData.settings.relationshipStartDate);
    } else {
      const local = localStorage.getItem('relationshipStartDate') || '';
      setRelationshipStartDate(local);
    }
  }, [settingsData]);
  const [gameSounds, setGameSounds] = useState(true);
  const [chatBackground, setChatBackground] = useState<ChatBackgroundKey>(() => {
    try {
      return (localStorage.getItem('ui:chatBackground') as ChatBackgroundKey) || 'none';
    } catch {
      return 'none';
    }
  });
  const DEFAULT_INVITE_PLACEHOLDER = 'Сгенерируйте код приглашения';
  const [invitePlaceholder, setInvitePlaceholder] = useState<string>(DEFAULT_INVITE_PLACEHOLDER);
  const [wordAnimations, setWordAnimations] = useState<WordAnimation[]>(() => {
    try {
      const raw = localStorage.getItem('ui:wordAnimations');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return DEFAULT_WORD_ANIMATIONS;
  });
  const [newWord, setNewWord] = useState<string>('');
  const [newWordAnim, setNewWordAnim] = useState<AnimationKey>('pulse');
  const [stopWord, setStopWord] = useState<string>('&стоп');
  const [chatPassword, setChatPassword] = useState({ current: '', next: '', confirm: '' });
  const [truthQuestions, setTruthQuestions] = useState('');
  const [dareActions, setDareActions] = useState('');
  const [guessQuestions, setGuessQuestions] = useState('');
  const [messageFontSize, setMessageFontSize] = useState<string>(() => {
    try {
      return localStorage.getItem('ui:messageFontSize') || 'text-sm';
    } catch {
      return 'text-sm';
    }
  });

  const baselineRef = useRef<UiSettingsState>({
    animationsEnabled,
    selectedFont,
    emailNotifications,
    pushNotifications,
    chatBackground,
    theme,
    memoriesVisibleForGuests,
    commentsAllowedForGuests,
    soundNotifications,
    eventReminders,
    calendarIntegration,
    gameSounds,
    wordAnimations,
    invitePlaceholder,
    uiLang,
    stopWord,
    truthQuestions: truthQuestions.split('\n').map((s) => s.trim()).filter(Boolean),
    dareActions: dareActions.split('\n').map((s) => s.trim()).filter(Boolean),
    guessQuestions: guessQuestions.split('\n').map((s) => s.trim()).filter(Boolean),
    relationshipStartDate,
  });

  const defaultsRef = useRef<UiSettingsState | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ui:defaultsSettings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          defaultsRef.current = parsed as UiSettingsState;
        }
      }
    } catch {}
  }, []);

  const { data: inviteCodeData } = useQuery<{ inviteCode: string | null }>({
    queryKey: ['/api/couple/invite-code'],
    enabled: user?.role === 'main_admin',
  });
  useEffect(() => {
    if (!settingsData?.settings) return;
    const s = settingsData.settings;
    if (s.theme && s.theme !== theme) setTheme(s.theme);
    if (typeof s.animations === 'boolean') setAnimationsEnabled(s.animations);
    if (typeof s.font === 'string') {
      setSelectedFont(s.font);
      try {
        localStorage.setItem('ui:font', s.font);
        applyUiFont(s.font);
      } catch {}
    }
    if (typeof s.chatBackground === 'string') setChatBackground(s.chatBackground);
    if (typeof s.emailNotifications === 'boolean') setEmailNotifications(s.emailNotifications);
    if (typeof s.pushNotifications === 'boolean') setPushNotifications(s.pushNotifications);
    if (s.privacy) {
      if (typeof s.privacy.guestCanViewMemories === 'boolean')
        setMemoriesVisibleForGuests(s.privacy.guestCanViewMemories);
      if (typeof s.privacy.guestCanComment === 'boolean')
        setCommentsAllowedForGuests(s.privacy.guestCanComment);
    }
    if (typeof s.soundNotifications === 'boolean') setSoundNotifications(s.soundNotifications);
    if (typeof s.eventReminders === 'boolean') setEventReminders(s.eventReminders);
    if (typeof s.calendarIntegration === 'boolean') setCalendarIntegration(s.calendarIntegration);
    if (typeof s.relationshipStartDate === 'string')
      setRelationshipStartDate(s.relationshipStartDate);
    if (typeof s.gameSounds === 'boolean') setGameSounds(s.gameSounds);
    if (Array.isArray(s.wordAnimations)) {
      setWordAnimations(s.wordAnimations);
      try {
        localStorage.setItem('ui:wordAnimations', JSON.stringify(s.wordAnimations));
      } catch {}
    }
    if (typeof s.invitePlaceholder === 'string') setInvitePlaceholder(s.invitePlaceholder);
    if (typeof s.stopWord === 'string') setStopWord(s.stopWord);
    if (Array.isArray(s.truthQuestions)) setTruthQuestions(s.truthQuestions.join('\n'));
    if (Array.isArray(s.dareActions)) setDareActions(s.dareActions.join('\n'));
    if (Array.isArray(s.guessQuestions)) setGuessQuestions(s.guessQuestions.join('\n'));

    baselineRef.current = {
      animationsEnabled: typeof s.animations === 'boolean' ? s.animations : animationsEnabled,
      selectedFont: typeof s.font === 'string' ? s.font : selectedFont,
      emailNotifications:
        typeof s.emailNotifications === 'boolean' ? s.emailNotifications : emailNotifications,
      pushNotifications:
        typeof s.pushNotifications === 'boolean' ? s.pushNotifications : pushNotifications,
      chatBackground: (typeof s.chatBackground === 'string'
        ? s.chatBackground
        : chatBackground) as ChatBackgroundKey,
      theme: s.theme ?? theme,
      memoriesVisibleForGuests: s.privacy?.guestCanViewMemories ?? memoriesVisibleForGuests,
      commentsAllowedForGuests: s.privacy?.guestCanComment ?? commentsAllowedForGuests,
      soundNotifications: s.soundNotifications ?? soundNotifications,
      eventReminders: s.eventReminders ?? eventReminders,
      calendarIntegration: s.calendarIntegration ?? calendarIntegration,
      gameSounds: s.gameSounds ?? gameSounds,
      wordAnimations: Array.isArray(s.wordAnimations) ? s.wordAnimations : wordAnimations,
      invitePlaceholder:
        typeof s.invitePlaceholder === 'string' ? s.invitePlaceholder : invitePlaceholder,
      uiLang: typeof s.uiLang === 'string' ? s.uiLang : uiLang,
      stopWord: typeof s.stopWord === 'string' ? s.stopWord : stopWord,
      truthQuestions: Array.isArray(s.truthQuestions) ? s.truthQuestions : [],
      dareActions: Array.isArray(s.dareActions) ? s.dareActions : [],
      guessQuestions: Array.isArray(s.guessQuestions) ? s.guessQuestions : [],
      relationshipStartDate:
        typeof s.relationshipStartDate === 'string' ? s.relationshipStartDate : relationshipStartDate,
    };

    if (!defaultsRef.current) {
      defaultsRef.current = { ...baselineRef.current };
      try {
        localStorage.setItem('ui:defaultsSettings', JSON.stringify(defaultsRef.current));
      } catch {}
}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData]);

  const inviteCode = inviteCodeData?.inviteCode || '';

  const generateInviteMutation = useMutation({
    mutationFn: () => apiRequest('/api/couple/invite', 'POST'),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/couple/invite-code'] });
      toast({
        title: 'Код приглашения создан',
        description: 'Новый код приглашения успешно сгенерирован',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Ошибка',
        description: err?.message || 'Не удалось создать код приглашения',
        variant: 'destructive',
      });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: () => apiRequest('/api/couple/revoke-invite', 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/couple/invite-code'] });
      toast({
        title: 'Код приглашения отозван',
        description: 'Код приглашения успешно деактивирован',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Ошибка',
        description: err?.message || 'Не удалось отозвать код приглашения',
        variant: 'destructive',
      });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (settings: { coupleSettings: CoupleSettingsPayload }) => apiRequest('/api/settings', 'PUT', settings),
    onSuccess: () => {
      baselineRef.current = {
        animationsEnabled,
        selectedFont,
        emailNotifications,
        pushNotifications,
        chatBackground,
        theme,
        memoriesVisibleForGuests,
        commentsAllowedForGuests,
        soundNotifications,
        eventReminders,
        calendarIntegration,
        gameSounds,
        wordAnimations,
        invitePlaceholder,
        uiLang,
        stopWord,
        truthQuestions: truthQuestions.split('\n').map((s) => s.trim()).filter(Boolean),
        dareActions: dareActions.split('\n').map((s) => s.trim()).filter(Boolean),
        guessQuestions: guessQuestions.split('\n').map((s) => s.trim()).filter(Boolean),
        relationshipStartDate,
      };
      toast({
        title: 'Настройки сохранены',
        description: 'Ваши настройки успешно обновлены',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error?.message || 'Не удалось сохранить настройки',
        variant: 'destructive',
      });
    },
  });

  const { data: countersData } = useQuery<
    Array<{ id: string; name: string; value: number; targetDate: string | null }>
  >({
    queryKey: ['/api/counters'],
  });

  useEffect(() => {
    if (Array.isArray(countersData)) {
      setCounters(
        countersData.map((c) => ({
          id: c.id,
          name: c.name,
          value: c.value,
          date: c.targetDate || undefined,
        })),
      );
    }
  }, [countersData]);

  const addCounterMutation = useMutation({
    mutationFn: (payload: { name: string; value: number; targetDate?: string }) =>
      apiRequest('/api/counters', 'POST', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/counters'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error?.message || 'Не удалось добавить счетчик',
        variant: 'destructive',
      });
    },
  });

  const deleteCounterMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/counters/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/counters'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error?.message || 'Не удалось удалить счетчик',
        variant: 'destructive',
      });
    },
  });

  const handleGenerateInviteCode = () => {
    generateInviteMutation.mutate();
  };

  const handleRevokeInviteCode = () => {
    revokeInviteMutation.mutate();
  };

  const handleCopyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast({
        title: 'Скопировано',
        description: 'Код приглашения скопирован в буфер обмена',
      });
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось скопировать код',
        variant: 'destructive',
      });
    }
  };

  const handleThemeChange = (checked: boolean) => {
    setTheme(checked ? 'dark' : 'light');
  };

  const handleSaveSettings = async () => {
    try {
      if (chatPassword.next && chatPassword.next !== chatPassword.confirm) {
        toast({
          title: 'Ошибка',
          description: 'Пароли не совпадают',
          variant: 'destructive',
        });
        return;
      }

      const coupleSettings: CoupleSettingsPayload = {
        theme,
        animations: animationsEnabled,
        font: selectedFont,
        chatBackground,
        emailNotifications,
        pushNotifications,
        soundNotifications,
        eventReminders,
        calendarIntegration,
        gameSounds,
        wordAnimations,
        invitePlaceholder,
        uiLang,
        stopWord,
        chatPassword: chatPassword.next || undefined,
        truthQuestions: truthQuestions.split('\n').map((s) => s.trim()).filter(Boolean),
        dareActions: dareActions.split('\n').map((s) => s.trim()).filter(Boolean),
        guessQuestions: guessQuestions.split('\n').map((s) => s.trim()).filter(Boolean),
        privacy: {
          // Канонические имена ключей из shared/schema.ts (coupleSettingsSchema).
          // Именно их читает серверный checkGuestAccess — иначе доступ гостям
          // никогда не выдаётся (падает в `?? false`).
          guestCanViewMemories: memoriesVisibleForGuests,
          guestCanComment: commentsAllowedForGuests,
        },
        relationshipStartDate,
      };
      await saveSettingsMutation.mutateAsync({ coupleSettings });
      setChatPassword({ current: '', next: '', confirm: '' });
      localStorage.setItem('relationshipStartDate', relationshipStartDate);
      localStorage.setItem('ui:chatBackground', chatBackground);
      window.dispatchEvent(
        new CustomEvent('uiSettingsChanged', {
          detail: { key: 'ui:chatBackground', value: chatBackground },
        }),
      );
      localStorage.setItem('ui:font', selectedFont);
      window.dispatchEvent(
        new CustomEvent('uiSettingsChanged', { detail: { key: 'ui:font', value: selectedFont } }),
      );
      applyUiFont(selectedFont as UiFont);
      localStorage.setItem('ui:wordAnimations', JSON.stringify(wordAnimations));
      window.dispatchEvent(
        new CustomEvent('uiSettingsChanged', {
          detail: { key: 'ui:wordAnimations', value: wordAnimations },
        }),
      );
      localStorage.setItem('ui:lang', uiLang);
      window.dispatchEvent(
        new CustomEvent('uiSettingsChanged', {
          detail: { key: 'ui:lang', value: uiLang },
        }),
      );
      if (baselineRef.current) baselineRef.current.uiLang = uiLang;
    } catch {}
  };

  const fontOptions = UI_FONT_OPTIONS;

  const initialTab = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab');
      const allowed = new Set([
        'access',
        'appearance',
        'messages',
        'notifications',
        'events',
        'games',
      ]);
      return allowed.has(t || '') ? (t as string) : 'access';
    } catch {
      return 'access';
    }
  })();

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const handleChatBackgroundChange = (value: string) => {
    setChatBackground(value as ChatBackgroundKey);
    try {
      localStorage.setItem('ui:chatBackground', value);
      window.dispatchEvent(
        new CustomEvent('uiSettingsChanged', { detail: { key: 'ui:chatBackground', value } }),
      );
    } catch {}
  };
  const handleFontChange = (value: string) => {
    setSelectedFont(value);
    applyUiFont(value as UiFont);
    try {
      localStorage.setItem('ui:font', value);
      window.dispatchEvent(
        new CustomEvent('uiSettingsChanged', { detail: { key: 'ui:font', value } }),
      );
    } catch {}
  };

  const handleUiLangChange = (value: 'ru' | 'en') => {
    setUiLang(value);
  };

  const isDirty =
    animationsEnabled !== baselineRef.current.animationsEnabled ||
    selectedFont !== baselineRef.current.selectedFont ||
    emailNotifications !== baselineRef.current.emailNotifications ||
    pushNotifications !== baselineRef.current.pushNotifications ||
    chatBackground !== baselineRef.current.chatBackground ||
    theme !== baselineRef.current.theme ||
    memoriesVisibleForGuests !== baselineRef.current.memoriesVisibleForGuests ||
    commentsAllowedForGuests !== baselineRef.current.commentsAllowedForGuests ||
    soundNotifications !== baselineRef.current.soundNotifications ||
    eventReminders !== baselineRef.current.eventReminders ||
    calendarIntegration !== baselineRef.current.calendarIntegration ||
    gameSounds !== baselineRef.current.gameSounds ||
    JSON.stringify(wordAnimations) !==
      JSON.stringify(baselineRef.current.wordAnimations) ||
    invitePlaceholder !== baselineRef.current.invitePlaceholder ||
    uiLang !== (baselineRef.current.uiLang ?? uiLang) ||
    stopWord !== (baselineRef.current.stopWord ?? stopWord) ||
    chatPassword.next.trim() !== '' ||
    truthQuestions.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') !==
      (baselineRef.current.truthQuestions ?? []).join('\n') ||
    dareActions.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') !==
      (baselineRef.current.dareActions ?? []).join('\n') ||
    guessQuestions.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') !==
      (baselineRef.current.guessQuestions ?? []).join('\n') ||
    relationshipStartDate !== (baselineRef.current.relationshipStartDate ?? relationshipStartDate);

  const handleResetSettings = () => {
    const d = defaultsRef.current;
    if (!d) return;
    setAnimationsEnabled(d.animationsEnabled);
    setSelectedFont(d.selectedFont);
    setEmailNotifications(d.emailNotifications);
    setPushNotifications(d.pushNotifications);
    setChatBackground(d.chatBackground);
    setTheme(d.theme as Parameters<typeof setTheme>[0]);
    setMemoriesVisibleForGuests(d.memoriesVisibleForGuests);
    setCommentsAllowedForGuests(d.commentsAllowedForGuests);
    setSoundNotifications(d.soundNotifications);
    setEventReminders(d.eventReminders);
    setCalendarIntegration(d.calendarIntegration);
    setGameSounds(d.gameSounds);
    setWordAnimations(d.wordAnimations || DEFAULT_WORD_ANIMATIONS);
    setInvitePlaceholder(d.invitePlaceholder ?? DEFAULT_INVITE_PLACEHOLDER);
    applyUiFont(d.selectedFont as UiFont);
  };

  useEffect(() => {
    const onPop = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('tab');
        const allowed = new Set([
          'access',
          'appearance',
          'messages',
          'notifications',
          'events',
          'games',
        ]);
        setActiveTab(allowed.has(t || '') ? (t as string) : 'access');
      } catch {}
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const updateUrlTab = (value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    window.history.replaceState({}, '', url.toString());
    setActiveTab(value);
  };

  return (
    <div className="flex min-h-full overflow-x-hidden" data-testid="settings-page">
      <main className="flex-1 p-3 sm:p-6 lg:p-8 min-w-0">
        <div className="max-w-4xl mx-auto min-w-0">
          <h1
            className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary mb-6 sm:mb-8"
            data-testid="page-title"
          >
            Настройки
          </h1>

          <Tabs
            value={activeTab}
            onValueChange={updateUrlTab}
            className="space-y-4 sm:space-y-6 min-w-0"
          >
            <div className="overflow-x-auto">
              <TabsList className="w-max min-w-full rounded-md p-1 flex flex-nowrap sm:grid sm:grid-cols-6 gap-1 no-scrollbar">
                <TabsTrigger
                  value="access"
                  data-testid="tab-access"
                  className="shrink-0 whitespace-nowrap px-3 py-2 text-xs sm:text-sm"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Доступ
                </TabsTrigger>
                <TabsTrigger
                  value="appearance"
                  data-testid="tab-appearance"
                  className="shrink-0 whitespace-nowrap px-3 py-2 text-xs sm:text-sm"
                >
                  <Palette className="w-4 h-4 mr-2" />
                  Оформление
                </TabsTrigger>
                <TabsTrigger
                  value="messages"
                  data-testid="tab-messages"
                  className="shrink-0 whitespace-nowrap px-3 py-2 text-xs sm:text-sm"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Сообщения
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  data-testid="tab-notifications"
                  className="shrink-0 whitespace-nowrap px-3 py-2 text-xs sm:text-sm"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Уведомления
                </TabsTrigger>
                <TabsTrigger
                  value="events"
                  data-testid="tab-events"
                  className="shrink-0 whitespace-nowrap px-3 py-2 text-xs sm:text-sm"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  События
                </TabsTrigger>
                <TabsTrigger
                  value="games"
                  data-testid="tab-games"
                  className="shrink-0 whitespace-nowrap px-3 py-2 text-xs sm:text-sm"
                >
                  <Gamepad2 className="w-4 h-4 mr-2" />
                  Игры
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="access" className="space-y-4 sm:space-y-6 min-w-0">
              <Card className="glass-strong">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Управление пользователями
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {user?.role === 'main_admin' && (
                    <>
                      <div>
                        <Label>Код приглашения</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            value={inviteCode}
                            readOnly
                            placeholder={invitePlaceholder}
                            className="font-mono"
                            data-testid="input-invite-code"
                          />
                          <Button
                            variant="outline"
                            onClick={handleCopyInviteCode}
                            disabled={!inviteCode}
                            data-testid="button-copy-invite"
                            aria-label="Скопировать код приглашения"
                            title="Скопировать код приглашения"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={handleGenerateInviteCode}
                            disabled={generateInviteMutation.isPending}
                            data-testid="button-generate-invite"
                          >
                            {generateInviteMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <UserPlus className="w-4 h-4 mr-2" />
                            )}
                            Создать
                          </Button>
                          {inviteCode && (
                            <Button
                              variant="destructive"
                              onClick={handleRevokeInviteCode}
                              disabled={revokeInviteMutation.isPending}
                              data-testid="button-revoke-invite"
                            >
                              {revokeInviteMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                'Отозвать'
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label className="text-base font-medium">Роли пользователей</Label>
                        <div className="space-y-3 mt-3">
                          <div className="flex items-center justify-between p-3 glass-strong rounded-lg">
                            <div>
                              <p className="font-medium">Главный администратор</p>
                              <p className="text-sm text-muted-foreground">
                                Полные права управления
                              </p>
                            </div>
                            <div className="text-accent-text font-medium">Вы</div>
                          </div>
                          <div className="p-3 glass-strong rounded-lg">
                            <p className="text-sm text-muted-foreground">
                              Участники появятся после присоединения по коду приглашения.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {user?.role !== 'main_admin' && (
                    <div className="text-center py-8">
                      <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        Только главный администратор может управлять доступом
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-strong">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Приватность контента
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Видимость воспоминаний для гостей</Label>
                        <p className="text-sm text-muted-foreground">
                          Могут ли гости видеть ваши воспоминания по умолчанию
                        </p>
                      </div>
                      <Switch
                        checked={memoriesVisibleForGuests}
                        onCheckedChange={setMemoriesVisibleForGuests}
                        aria-label="Видимость воспоминаний для гостей"
                        data-testid="switch-memories-visibility"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Возможность комментирования</Label>
                        <p className="text-sm text-muted-foreground">
                          Могут ли гости оставлять комментарии
                        </p>
                      </div>
                      <Switch
                        checked={commentsAllowedForGuests}
                        onCheckedChange={setCommentsAllowedForGuests}
                        aria-label="Возможность комментирования для гостей"
                        data-testid="switch-comments-visibility"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4 sm:space-y-6 min-w-0">
              <Card className="glass-strong">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-5 h-5" />
                    Внешний вид
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Темная тема</Label>
                      <p className="text-sm text-muted-foreground">
                        Переключение между светлой и темной темой
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4" />
                      <Switch
                        checked={theme === 'dark'}
                        onCheckedChange={handleThemeChange}
                        aria-label="Темная тема"
                        data-testid="switch-dark-mode"
                      />
                      <Moon className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Анимации переходов</Label>
                      <p className="text-sm text-muted-foreground">
                        Включить плавные анимации интерфейса
                      </p>
                    </div>
                    <Switch
                      checked={animationsEnabled}
                      onCheckedChange={setAnimationsEnabled}
                      aria-label="Анимации переходов"
                      data-testid="switch-animations"
                    />
                  </div>

                  <div>
                    <Label>Язык интерфейса</Label>
                    <Select value={uiLang} onValueChange={val => handleUiLangChange(val as 'ru' | 'en')}>
                      <SelectTrigger
                        className="mt-2"
                        data-testid="select-lang"
                        aria-label="Язык интерфейса"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem key="ru" value="ru">Русский</SelectItem>
                        <SelectItem key="en" value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Шрифт интерфейса</Label>
                    <Select value={selectedFont} onValueChange={handleFontChange}>
                      <SelectTrigger
                        className="mt-2"
                        data-testid="select-font"
                        aria-label="Шрифт интерфейса"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fontOptions.map((font) => (
                          <SelectItem key={font.value} value={font.value}>
                            {font.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="messages" className="space-y-4 sm:space-y-6 min-w-0">
              <Card className="glass-strong">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Настройки чата
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label>Фон чата</Label>
                    <Select value={chatBackground} onValueChange={handleChatBackgroundChange}>
                      <SelectTrigger
                        className="mt-2"
                        data-testid="select-chat-background"
                        aria-label="Фон чата"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHAT_BACKGROUNDS.map((b) => (
                          <SelectItem key={b.key} value={b.key}>
                            {b.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Размер шрифта сообщений</Label>
                    <Select value={messageFontSize} onValueChange={(val) => {
                      setMessageFontSize(val);
                      localStorage.setItem('ui:messageFontSize', val);
                      window.dispatchEvent(new CustomEvent('uiSettingsChanged', { detail: { key: 'ui:messageFontSize', value: val } }));
                    }}>
                      <SelectTrigger
                        className="mt-2"
                        data-testid="select-message-font-size"
                        aria-label="Размер шрифта сообщений"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem key="text-xs" value="text-xs">Очень маленький</SelectItem>
                        <SelectItem key="text-sm" value="text-sm">Маленький</SelectItem>
                        <SelectItem key="text-base" value="text-base">Средний</SelectItem>
                        <SelectItem key="text-lg" value="text-lg">Большой</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Стоп-слово</Label>
                    <Input
                      placeholder="Введите стоп-слово с префиксом &"
                      value={stopWord}
                      onChange={(e) => setStopWord(e.target.value)}
                      className="mt-2"
                      data-testid="input-stop-word"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Блокирует чат на 10 минут (можно использовать раз в сутки)
                    </p>
                  </div>

                  <div>
                    <Label>Анимации совпадающих слов</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Настройте подсветку слов и выберите для них анимации
                    </p>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {wordAnimations.map(({ word, animation }, idx) => (
                          <div
                            key={`${word}-${idx}`}
                            className="flex items-center gap-2 px-2 py-1 bg-surface-soft text-text-primary rounded-full text-sm"
                          >
                            <span className="text-primary">{word}</span>
                            <Select
                              value={animation}
                              onValueChange={(val) => {
                                const next = [...wordAnimations];
                                next[idx] = { word, animation: val as AnimationKey };
                                setWordAnimations(next);
                              }}
                            >
                              <SelectTrigger
                                className="h-7 w-40"
                                aria-label={`Анимация для слова ${word}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AVAILABLE_ANIMATIONS.map((a) => (
                                  <SelectItem key={a.key} value={a.key}>
                                    {a.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Удалить слово ${word}`}
                              title={`Удалить слово ${word}`}
                              onClick={() => {
                                setWordAnimations(wordAnimations.filter((_, i) => i !== idx));
                              }}
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={newWord}
                          onChange={(e) => setNewWord(e.target.value)}
                          placeholder="Добавить новое слово"
                          data-testid="input-animation-word"
                        />
                        <Select
                          value={newWordAnim}
                          onValueChange={(v) => setNewWordAnim(v as AnimationKey)}
                        >
                          <SelectTrigger className="w-44" aria-label="Анимация">
                            <SelectValue placeholder="Анимация" />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_ANIMATIONS.map((a) => (
                              <SelectItem key={a.key} value={a.key}>
                                {a.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const w = newWord.trim();
                            if (!w) return;
                            const idx = wordAnimations.findIndex(
                              (x) => x.word.toLowerCase() === w.toLowerCase(),
                            );
                            if (idx >= 0) {
                              const next = [...wordAnimations];
                              next[idx] = { word: next[idx].word, animation: newWordAnim };
                              setWordAnimations(next);
                            } else {
                              setWordAnimations([
                                ...wordAnimations,
                                { word: w, animation: newWordAnim },
                              ]);
                            }
                            setNewWord('');
                          }}
                        >
                          Добавить
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Подсказка: одинаковые анимации можно назначать разным словам.
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label>Пароль для личных сообщений</Label>
                    <div className="space-y-2 mt-2">
                      <Input
                        type="password"
                        placeholder="Текущий пароль"
                        data-testid="input-current-chat-password"
                        value={chatPassword.current}
                        onChange={(e) =>
                          setChatPassword((p) => ({ ...p, current: e.target.value }))
                        }
                      />
                      <Input
                        type="password"
                        placeholder="Новый пароль"
                        data-testid="input-new-chat-password"
                        value={chatPassword.next}
                        onChange={(e) =>
                          setChatPassword((p) => ({ ...p, next: e.target.value }))
                        }
                      />
                      <Input
                        type="password"
                        placeholder="Подтвердите новый пароль"
                        data-testid="input-confirm-chat-password"
                        value={chatPassword.confirm}
                        onChange={(e) =>
                          setChatPassword((p) => ({ ...p, confirm: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4 sm:space-y-6 min-w-0">
              <Card className="glass-strong">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="w-5 h-5" />
                    Уведомления
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <p className="text-sm text-muted-foreground">
                    Эти предпочтения сохраняются, но доставка уведомлений (email,
                    push, звук) пока не подключена — переключатели действуют на
                    будущее.
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Email уведомления</Label>
                      <p className="text-sm text-muted-foreground">
                        Получать уведомления на электронную почту
                      </p>
                    </div>
                    <Switch
                      checked={emailNotifications}
                      onCheckedChange={setEmailNotifications}
                      aria-label="Email уведомления"
                      data-testid="switch-email-notifications"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Push уведомления</Label>
                      <p className="text-sm text-muted-foreground">
                        Мгновенные уведомления в браузере
                      </p>
                    </div>
                    <Switch
                      checked={pushNotifications}
                      onCheckedChange={setPushNotifications}
                      aria-label="Push уведомления"
                      data-testid="switch-push-notifications"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Звуковые уведомления</Label>
                      <p className="text-sm text-muted-foreground">
                        Проигрывать звуки при получении сообщений
                      </p>
                    </div>
                    <Switch
                      checked={soundNotifications}
                      onCheckedChange={setSoundNotifications}
                      aria-label="Звуковые уведомления"
                      data-testid="switch-sound-notifications"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Напоминания о событиях</Label>
                      <p className="text-sm text-muted-foreground">
                        Уведомления о важных датах и событиях
                      </p>
                    </div>
                    <Switch
                      checked={eventReminders}
                      onCheckedChange={setEventReminders}
                      aria-label="Напоминания о событиях"
                      data-testid="switch-event-reminders"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="events" className="space-y-4 sm:space-y-6 min-w-0">
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    События и счетчики
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label>Активные счетчики</Label>
                    <div className="space-y-3 mt-3">
                      {counters.length === 0 ? (
                        <div className="p-3 glass-strong rounded-lg">
                          <p className="text-sm text-muted-foreground">
                            Пока нет счетчиков. Добавьте свой ниже.
                          </p>
                        </div>
                      ) : (
                        counters.map((counter, idx) => (
                          <div
                            key={counter.id || idx}
                            className="p-3 glass-strong rounded-lg flex items-center gap-4"
                          >
                            <span className="font-medium">{counter.name}</span>
                            <span className="text-sm">{counter.value}</span>
                            {counter.date && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(counter.date).toLocaleDateString('ru-RU')}
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteCounterMutation.mutate(counter.id)}
                              aria-label={`Удалить счетчик ${counter.name}`}
                              data-testid={`delete-counter-${idx}`}
                            >
                              ×
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="relationshipStartDate" className="text-base font-medium">
                      Дата начала отношений
                    </Label>
                    <div className="flex gap-2 mt-2 items-center">
                      <Input
                        id="relationshipStartDate"
                        type="date"
                        value={relationshipStartDate}
                        onChange={(e) => setRelationshipStartDate(e.target.value)}
                        className="w-48"
                        data-testid="input-relationship-start-date"
                      />
                      {relationshipStartDate && (
                        <span className="text-sm text-muted-foreground">
                          {(() => {
                            const date = new Date(relationshipStartDate);
                            if (isNaN(date.getTime())) return null;
                            return date.toLocaleDateString('ru-RU', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            });
                          })()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Эта дата будет использоваться для расчёта "Дней вместе" на странице профиля.
                    </p>
                  </div>

                  <div>
                    <Label>Добавить новый счетчик</Label>
                    <div className="space-y-2 mt-2">
                      <Input
                        placeholder="Название счетчика"
                        data-testid="input-counter-name"
                        value={newCounterName}
                        onChange={(e) => setNewCounterName(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Значение"
                          data-testid="input-counter-value"
                          value={newCounterValue}
                          onChange={(e) =>
                            setNewCounterValue(e.target.value === '' ? '' : Number(e.target.value))
                          }
                        />
                        <Input
                          type="date"
                          placeholder="Целевая дата"
                          data-testid="input-counter-date"
                          value={newCounterDate}
                          onChange={(e) => setNewCounterDate(e.target.value)}
                        />
                      </div>
                      <Button
                        variant="outline"
                        data-testid="button-add-counter"
                        onClick={() => {
                          if (
                            !newCounterName ||
                            newCounterValue === '' ||
                            isNaN(Number(newCounterValue))
                          )
                            return;
                          addCounterMutation.mutate({
                            name: newCounterName,
                            value: Number(newCounterValue),
                            targetDate: newCounterDate || undefined,
                          });
                          setNewCounterName('');
                          setNewCounterValue('');
                          setNewCounterDate('');
                        }}
                      >
                        Добавить счетчик
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Интеграция с календарем</Label>
                      <p className="text-sm text-muted-foreground">
                        Синхронизация событий с календарем устройства
                      </p>
                    </div>
                    <Switch
                      checked={calendarIntegration}
                      onCheckedChange={setCalendarIntegration}
                      aria-label="Интеграция с календарем"
                      data-testid="switch-calendar-integration"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="games" className="space-y-4 sm:space-y-6 min-w-0">
              <Card className="glass-strong">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5" />
                    Настройки игр
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label>"Правда или действие" - вопросы</Label>
                    <Textarea
                      placeholder="Введите свои вопросы (по одному на строку)"
                      className="mt-2 min-h-[100px]"
                      data-testid="textarea-truth-questions"
                      value={truthQuestions}
                      onChange={(e) => setTruthQuestions(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>"Правда или действие" - действия</Label>
                    <Textarea
                      placeholder="Введите свои задания (по одному на строку)"
                      className="mt-2 min-h-[100px]"
                      data-testid="textarea-dare-actions"
                      value={dareActions}
                      onChange={(e) => setDareActions(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>"Угадай меня" - вопросы</Label>
                    <Textarea
                      placeholder="Введите вопросы о себе и партнере"
                      className="mt-2 min-h-[100px]"
                      data-testid="textarea-guess-questions"
                      value={guessQuestions}
                      onChange={(e) => setGuessQuestions(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Звуки в играх</Label>
                      <p className="text-sm text-muted-foreground">
                        Проигрывать звуковые эффекты в играх
                      </p>
                    </div>
                    <Switch
                      checked={gameSounds}
                      onCheckedChange={setGameSounds}
                      aria-label="Звуки в играх"
                      data-testid="switch-game-sounds"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-4 mt-8">
            {isDirty && (
              <Button
                variant="outline"
                onClick={handleResetSettings}
                data-testid="button-reset-settings"
              >
                Сбросить
              </Button>
            )}
            <Button
              onClick={handleSaveSettings}
              className="btn-gradient"
              disabled={!isDirty || saveSettingsMutation.isPending}
              data-testid="button-save-settings"
            >
              {saveSettingsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                'Сохранить настройки'
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
