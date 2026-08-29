import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { AvatarUpload } from '@/components/avatar-upload';
import { useAuth } from '@/hooks/use-auth';
import { Heart, Calendar, MapPin, Loader2, AlertCircle, Trash, MessageCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type UpdateProfile } from '@shared/schema';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const isHttpUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

type ProfileData = {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  coupleId: string;
  createdAt: string;
  status: string | null;
  wishlist: Array<{ title: string; link?: string }>;
  stats: {
    memoriesCount: number;
    messagesCount: number;
    gamesCount: number;
    daysInCouple: number;
    placesVisited: number;
  };
};

export default function ProfilePage() {
  const [relationshipStartDate, setRelationshipStartDate] = React.useState<string>('');
  const {
    data: settings,
  } = useQuery<{ settings?: { relationshipStartDate?: string } }>({
    queryKey: ['/api/settings'],
  });

  React.useEffect(() => {
    if (settings?.settings?.relationshipStartDate) {
      setRelationshipStartDate(settings.settings.relationshipStartDate);
    } else {
      const local = localStorage.getItem('relationshipStartDate') || '';
      setRelationshipStartDate(local);
    }
  }, [settings]);

  React.useEffect(() => {
    if (document.visibilityState === 'visible') {
      if (settings?.settings?.relationshipStartDate) {
        setRelationshipStartDate(settings.settings.relationshipStartDate);
      } else {
        const local = localStorage.getItem('relationshipStartDate') || '';
        setRelationshipStartDate(local);
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (settings?.settings?.relationshipStartDate) {
          setRelationshipStartDate(settings.settings.relationshipStartDate);
        } else {
          const local = localStorage.getItem('relationshipStartDate') || '';
          setRelationshipStartDate(local);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [settings]);

  const daysTogether = React.useMemo(() => {
    if (!relationshipStartDate) return 0;
    const start = new Date(relationshipStartDate);
    if (isNaN(start.getTime())) return 0;
    const now = new Date();
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diff = now.getTime() - start.getTime();
    return diff >= 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) + 1 : 0;
  }, [relationshipStartDate]);
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery<ProfileData>({
    queryKey: ['/api/profile'],
    enabled: !!user,
  });

  const profileFormSchema = z.object({
    username: z
      .union([
        z
          .string()
          .trim()
          .min(1, 'Никнейм обязателен')
          .max(50, 'Никнейм не может быть длиннее 50 символов'),
        z.literal(''),
      ])
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
    firstName: z.string().max(100, 'Имя не может быть длиннее 100 символов').optional().nullable(),
    lastName: z
      .string()
      .max(100, 'Фамилия не может быть длиннее 100 символов')
      .optional()
      .nullable(),
    profileImageUrl: z
      .union([
        z
          .string()
          .trim()
          .refine((v) => isHttpUrl(v) || v.startsWith('/uploads/'), {
            message: 'Некорректный URL изображения',
          }),
        z.literal(''),
      ])
      .transform((v) => (v === '' ? undefined : v))
      .optional()
      .nullable(),
    email: z
      .union([z.string().trim().email('Некорректный email'), z.literal('')])
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
    status: z.string().max(1000, 'Статус слишком длинный').optional().nullable(),
    wishlist: z
      .array(
        z.object({
          title: z.string().min(1, 'Название обязательно'),
          link: z
            .string()
            .url('Некорректная ссылка')
            .optional()
            .or(z.literal(''))
            .transform((v) => (v ? v : undefined)),
        }),
      )
      .optional()
      .default([]),
  });

  type ProfileFormValues = z.infer<typeof profileFormSchema>;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: '',
      firstName: '',
      lastName: '',
      email: '',
      profileImageUrl: null,
      status: '',
      wishlist: [],
    },
  });

  const { fields: wishlistFields, remove /* append */ } = useFieldArray({
    control: form.control,
    name: 'wishlist',
  });

  const [newWishTitle, setNewWishTitle] = React.useState('');
  const [newWishLink, setNewWishLink] = React.useState('');

  const { isDirty } = form.formState;

  const canSave = React.useMemo(() => {
    return isDirty;
  }, [isDirty]);

  React.useEffect(() => {
    if (profile && !isDirty) {
      form.reset({
        username: profile.username,
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: profile.email,
        profileImageUrl: profile.profileImageUrl,
        status: profile.status || '',
                      wishlist: profile.wishlist || [],
      });
    }
  }, [profile, form, isDirty]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfile) => {
      const res = await apiRequest('/api/profile', 'PUT', data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Профиль обновлен',
        description: 'Ваши изменения успешно сохранены',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    },
    onError: async (error: Error) => {
      let message = error.message || 'Не удалось обновить профиль';
      try {
        const colonIdx = message.indexOf(': ');
        const maybeJson = colonIdx >= 0 ? message.slice(colonIdx + 2) : '';
        if (maybeJson.startsWith('{')) {
          const parsed = JSON.parse(maybeJson);
          if (Array.isArray(parsed.details)) {
            for (const d of parsed.details) {
              const field = d.field as keyof ProfileFormValues;
              const msg = d.message || parsed.message || 'Некорректные данные';
              if (field) {
                form.setError(field, { message: msg });
              }
            }
            message = parsed.message || message;
          } else if (parsed.message) {
            message = parsed.message;
          }
        }
      } catch {}
      toast({
        title: 'Ошибка',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = async (data: ProfileFormValues) => {
    const { status, wishlist, ...serverFields } = data;

    const nullableFields = new Set(['firstName', 'lastName', 'profileImageUrl']);
    const normalizedEntries = Object.entries(serverFields).map(([k, v]) => {
      if (typeof v === 'string') {
        const t = v.trim();
        if (t === '') {
          return [k, nullableFields.has(k) ? null : undefined];
        }
        return [k, t];
      }
      return [k, v];
    });
    const cleanServerData = Object.fromEntries(
      normalizedEntries.filter(([_, value]) => value !== undefined),
    ) as Partial<UpdateProfile>;

    const hasStatus = status !== undefined;
    const hasWishlist = wishlist !== undefined;
    const hasServerChanges = Object.keys(cleanServerData).length > 0;
    const hasLocalChanges = hasStatus || hasWishlist;

    if (!hasServerChanges && !hasLocalChanges) {
      toast({
        title: 'Нет изменений',
        description: 'Нет данных для обновления',
        variant: 'destructive',
      });
      return;
    }

    let mutationErrorHandled = false;
    try {
      const didServerUpdate = Object.keys(cleanServerData).length > 0;
      let updatedFromServer: Partial<ProfileData> | null = null;
      if (didServerUpdate) {
        try {
          const res = await updateProfileMutation.mutateAsync(cleanServerData as UpdateProfile);
          updatedFromServer = res as Partial<ProfileData>;
        } catch (mutationError) {
          mutationErrorHandled = true;
          throw mutationError;
        }
        try {
          const merged: (old: ProfileData | undefined) => ProfileData | undefined = (old) =>
            (old
              ? { ...old, ...cleanServerData, ...updatedFromServer }
              : { ...cleanServerData, ...updatedFromServer }) as ProfileData;
          queryClient.setQueryData<ProfileData>(['/api/profile'], merged);
          queryClient.setQueryData<ProfileData>(['/api/user'], merged);
        } catch {}
      }

      if (hasStatus || hasWishlist) {
        const serverPayload: Partial<UpdateProfile> = {};
        if (hasStatus) serverPayload.status = status ?? '';
        if (hasWishlist) serverPayload.wishlist = wishlist ?? [];
        const res2 = await apiRequest('/api/profile', 'PUT', serverPayload);
        const updated = await res2.json();
        try {
          queryClient.setQueryData<ProfileData>(['/api/profile'], (old) => ({ ...old, ...updated }));
          queryClient.setQueryData<ProfileData>(['/api/user'], (old) => ({ ...old, ...updated }));
        } catch {}
      }

      if (!didServerUpdate) {
        toast({
          title: 'Профиль обновлен',
          description: 'Изменения сохранены',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    } catch (e) {
      if (mutationErrorHandled) return;
      const submitError = e as Error;
      toast({
        title: 'Ошибка',
        description: submitError?.message || 'Не удалось обновить профиль',
        variant: 'destructive',
      });
    }
  };

  const saveWishlistImmediately = async (newItem: { title: string; link?: string }) => {
    if (!profile) return;
    const currentWishlist = form.getValues('wishlist') || [];
    const updatedWishlist = [...currentWishlist, newItem];
    form.setValue('wishlist', updatedWishlist, { shouldDirty: true });
    try {
      await apiRequest('/api/profile', 'PUT', { wishlist: updatedWishlist });
      toast({
        title: 'Элемент добавлен',
        description: 'Новый элемент вишлиста сохранен',
      });
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось сохранить элемент вишлиста',
        variant: 'destructive',
      });
    }
  };

  const removeWishlistItemImmediately = async (index: number) => {
    if (!profile) return;
    const currentWishlist = form.getValues('wishlist') || [];
    const updatedWishlist = currentWishlist.filter((_, idx) => idx !== index);
    form.setValue('wishlist', updatedWishlist, { shouldDirty: true });
    remove(index);
    try {
      await apiRequest('/api/profile', 'PUT', { wishlist: updatedWishlist });
      toast({
        title: 'Элемент удален',
        description: 'Элемент вишлиста удален',
      });
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить элемент вишлиста',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <main className="flex-1 p-6" data-testid="profile-page">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Загрузка профиля...</span>
          </div>
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="flex-1 p-6" data-testid="profile-page">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64 text-destructive">
            <AlertCircle className="h-8 w-8" />
            <span className="ml-2">Не удалось загрузить профиль</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8" data-testid="profile-page">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary mb-8" data-testid="page-title">
          Профиль
        </h1>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (errors) => {
              const first = Object.keys(errors)[0] as keyof typeof errors | undefined;
              const msg =
                first && errors[first]?.message
                  ? errors[first].message
                  : 'Исправьте ошибки формы';
              toast({
                title: 'Проверка не пройдена',
                description: String(msg),
                variant: 'destructive',
              });
              try {
                const map: Record<string, string> = {
                  username: 'input-username',
                  email: 'input-email',
                  firstName: 'input-first-name',
                  lastName: 'input-last-name',
                  status: 'input-status',
                };
                if (first && map[first as string]) {
                  const el = document.querySelector(
                    `[data-testid="${map[first as string]}"]`,
                  ) as HTMLElement | null;
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el?.focus();
                }
              } catch {}
            })}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Основная информация */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="border border-border-subtle bg-surface hover:bg-surface-hover transition-colors">
                  <CardHeader>
                    <CardTitle>Основная информация</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Никнейм</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              data-testid="input-username"
                              placeholder="Введите никнейм"
                              className="focus-ring"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              data-testid="input-email"
                              placeholder="Введите email"
                              className="focus-ring"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Имя</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ''}
                              data-testid="input-first-name"
                              placeholder="Введите имя"
                              className="focus-ring"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Фамилия</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ''}
                              data-testid="input-last-name"
                              placeholder="Введите фамилию"
                              className="focus-ring"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card className="border border-border-subtle bg-surface hover:bg-surface-hover transition-colors">
                  <CardHeader>
                    <CardTitle>Статус</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ваш статус</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              value={field.value || ''}
                              placeholder="Напишите что-нибудь о себе..."
                              className="mt-2 focus-ring"
                              data-testid="input-status"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card className="border border-border-subtle bg-surface hover:bg-surface-hover transition-colors">
                  <CardHeader>
                    <CardTitle>Вишлист</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Добавьте то, что хотели бы приобрести или получить в подарок
                      </p>

                      {wishlistFields.length > 0 && (
                        <div className="space-y-2">
                          {wishlistFields.map((item, idx) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 border rounded-md p-2 transition-all hover:shadow-sm"
                            >
                              <div className="flex-1 overflow-hidden">
                                <div className="font-medium truncate">
                                  {form.watch(`wishlist.${idx}.title`) || '(без названия)'}
                                </div>
                                {form.watch(`wishlist.${idx}.link`) && (
                                  <a
                                    href={form.watch(`wishlist.${idx}.link`) as string}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary truncate"
                                  >
                                    {form.watch(`wishlist.${idx}.link`) as string}
                                  </a>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Удалить"
                                title="Удалить"
                                onClick={() => removeWishlistItemImmediately(idx)}
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-3">
                        <Input
                          placeholder="Название желания"
                          value={newWishTitle}
                          onChange={(e) => setNewWishTitle(e.target.value)}
                          className="focus-ring"
                          data-testid="input-wishlist-item"
                        />
                        <Input
                          placeholder="Ссылка (необязательно)"
                          value={newWishLink}
                          onChange={(e) => setNewWishLink(e.target.value)}
                          className="focus-ring"
                          data-testid="input-wishlist-link"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!newWishTitle.trim()) return;
                            const newItem = {
                              title: newWishTitle.trim(),
                              link: newWishLink.trim() || undefined,
                            };

                            saveWishlistImmediately(newItem);

                            setNewWishTitle('');
                            setNewWishLink('');
                          }}
                          className="hover-lift"
                          data-testid="button-add-wishlist"
                        >
                          Добавить
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Боковая панель (аватар + статистика + роль) */}
              <div className="space-y-6">
                <Card className="glass-strong hover-lift">
                  <CardHeader>
                    <CardTitle>Аватар</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AvatarUpload
                      currentAvatarUrl={profile?.profileImageUrl}
                      username={profile?.username}
                      onAvatarChange={async (newUrl) => {
                        form.setValue('profileImageUrl', newUrl, { shouldDirty: true });
                        await queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
                        await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
                      }}
                    />
                  </CardContent>
                </Card>

                <Card className="glass-strong hover-lift">
                  <CardHeader>
                    <CardTitle>Статистика</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Heart className="h-5 w-5 text-text-secondary" />
                      <div>
                        <p className="text-sm font-medium">Дней вместе</p>
                        <p
                          className="text-2xl font-bold text-text-primary"
                          data-testid="stat-days-together"
                        >
                          {daysTogether}
                        </p>
                        {relationshipStartDate && (
                          <p className="text-xs text-muted-foreground mt-1">
                            с{' '}
                            {(() => {
                              const date = new Date(relationshipStartDate);
                              if (isNaN(date.getTime())) return null;
                              return date.toLocaleDateString('ru-RU', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              });
                            })()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-text-secondary" />
                      <div>
                        <p className="text-sm font-medium">Воспоминаний</p>
                        <p
                          className="text-2xl font-bold text-text-primary"
                          data-testid="stat-memories"
                        >
                          {profile?.stats.memoriesCount || 0}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-text-secondary" />
                      <div>
                        <p className="text-sm font-medium">Мест посещено</p>
                        <p
                          className="text-2xl font-bold text-text-primary"
                          data-testid="stat-places"
                        >
                          {profile?.stats.placesVisited || 0}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <MessageCircle className="h-5 w-5 text-text-secondary" />
                      <div>
                        <p className="text-sm font-medium">Сообщений</p>
                        <p
                          className="text-2xl font-bold text-text-primary"
                          data-testid="stat-messages"
                        >
                          {profile?.stats.messagesCount || 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            </div>

            <div className="flex justify-center gap-4 my-8">
              {isDirty && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!profile) return form.reset();
                    form.reset({
                      username: profile.username,
                      firstName: profile.firstName || '',
                      lastName: profile.lastName || '',
                      email: profile.email,
                      profileImageUrl: profile.profileImageUrl,
                      status: profile.status || '',
        wishlist: profile.wishlist || [],
                    });
                  }}
                  data-testid="button-cancel"
                  className="hover-lift focus-ring"
                >
                  Отмена
                </Button>
              )}
              <Button
                type="submit"
                className="btn-gradient"
                disabled={updateProfileMutation.isPending || !canSave}
                aria-disabled={updateProfileMutation.isPending || !canSave}
                data-testid="button-save-profile"
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Сохранить изменения'
                )}
              </Button>
            </div>
          </form>
        </Form>

        <div className="mt-12 pt-6 flex justify-center">
          <Button
            variant="destructive"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="hover-lift focus-ring bg-destructive text-destructive-foreground hover:bg-accent-hover"
            data-testid="button-logout"
          >
            {logoutMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Выход...
              </>
            ) : (
              'Выйти из аккаунта'
            )}
          </Button>
        </div>
      </div>
    </main>
  );
}
