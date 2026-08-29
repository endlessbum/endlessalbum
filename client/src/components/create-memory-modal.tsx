import { useEffect, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InsertMemory, type Memory } from "@shared/schema";
import { MEMORY_IMAGE_MAX_SIZE, MEMORY_VIDEO_MAX_SIZE } from "@shared/constants";
import { formatMaxSizeMb } from "@shared/utils";
import { z } from "zod";
import { apiRequest, attachCsrfHeader } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageIcon, VideoIcon, Type, Quote, GripVertical, Trash2, Star } from "lucide-react";

const memoryTypeOptions = [
  { value: "text", label: "Текст", icon: Type },
  { value: "photo", label: "Фото", icon: ImageIcon },
  { value: "video", label: "Видео", icon: VideoIcon },
  { value: "quote", label: "Цитата", icon: Quote },
] as const;

const createMemoryFormSchema = z.object({
  title: z.string().optional().nullable().transform(v => v && v.trim() === '' ? null : v || null),
  content: z.string().optional().nullable().transform(v => (v && v.trim() !== '' ? v.trim() : '')),
  type: z.enum(["text", "photo", "video", "quote"], { message: "Выберите тип воспоминания" }),
  mediaUrl: z.string().optional().nullable().or(z.literal('')).transform(v => v && v.trim() === '' ? null : v || null),
  thumbnailUrl: z.string().nullable().optional(),
  visibility: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).nullable().optional(),
  locationName: z.string().optional().transform(v => (v && v.trim() !== '' ? v.trim() : undefined)),
  quoteAuthor: z.string().optional().transform(v => (v ? v.trim() : undefined)),
  audioUrl: z.string().optional().nullable().transform(v => (v && v.trim() !== '' ? v : null)),
}).superRefine((v, ctx) => {
  const isAbsoluteUrl = (s?: string | null) => !!s && /^https?:\/\//i.test(s);
  const isUploadsPath = (s?: string | null) => !!s && s.startsWith('/uploads/');

  if (v.type === 'text' || v.type === 'quote') {
    if (!v.content || v.content.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Содержимое обязательно для текста и цитаты' });
    }
  }

  if (v.type === 'video') {
    if (!v.mediaUrl || (!isAbsoluteUrl(v.mediaUrl) && !isUploadsPath(v.mediaUrl))) {
      ctx.addIssue({ code: 'custom', path: ['mediaUrl'], message: 'Загрузите видео или укажите корректную ссылку' });
    }
  }

  if (v.type === 'photo') {
    if (!v.mediaUrl || (!isAbsoluteUrl(v.mediaUrl) && !isUploadsPath(v.mediaUrl))) {
      ctx.addIssue({ code: 'custom', path: ['mediaUrl'], message: 'Загрузите изображение или укажите корректную ссылку' });
    }
  }
});

type CreateMemoryFormValues = z.infer<typeof createMemoryFormSchema>;
type CardRatio = '9:16' | '4:5' | '5:7' | '3:4' | '3:5' | '2:3';

interface CreateMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  'data-testid'?: string;
  initialType?: 'text' | 'photo' | 'video' | 'quote';
  editMemory?: Memory | null;
}

export default function CreateMemoryModal({ isOpen, onClose, initialType, editMemory, 'data-testid': testId }: CreateMemoryModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [focusX, setFocusX] = useState<number>(50);
  const [focusY, setFocusY] = useState<number>(50);
  const [cardRatio, setCardRatio] = useState<CardRatio>('3:4');
  const [cardOrient, setCardOrient] = useState<'horizontal'|'vertical'>('horizontal');

  type ClientInsertMemory = Omit<InsertMemory, "coupleId" | "authorId">;

  const form = useForm<CreateMemoryFormValues>({
    resolver: zodResolver(createMemoryFormSchema),
    defaultValues: {
      title: "",
      content: "",
      type: "text",
      mediaUrl: "",
      thumbnailUrl: null,
      visibility: {},
      tags: [],
      locationName: "",
  quoteAuthor: "",
  audioUrl: null,
    },
  });

  const createMemoryMutation = useMutation({
    mutationFn: async (data: ClientInsertMemory & { extra?: { audioUrl?: string | null } }) => {
      const url = editMemory ? `/api/memories/${editMemory.id}` : "/api/memories";
      const method = editMemory ? "PUT" : "POST";
      const res = await apiRequest(url, method, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories"] });
      toast({
        title: editMemory ? "Воспоминание обновлено" : "Воспоминание создано",
        description: editMemory 
          ? "Ваше воспоминание успешно обновлено" 
          : "Ваше воспоминание успешно добавлено в альбом",
      });
      form.reset();
      onClose();
    },
    onError: (error) => {
      console.error("Error creating memory:", error);
      toast({
        title: "Ошибка создания",
        description: "Не удалось создать воспоминание. Попробуйте снова.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateMemoryFormValues) => {
  const { locationName, title, content, type, mediaUrl, thumbnailUrl, visibility, tags, quoteAuthor, audioUrl } = data;
    const finalTags = Array.isArray(tags) ? [...tags] : [];
    if (locationName) {
      finalTags.push(`location:${locationName}`);
    }
    if (type === 'quote' && quoteAuthor && quoteAuthor.trim() !== '') {
      const normalized = quoteAuthor.startsWith('@') ? quoteAuthor.slice(1) : quoteAuthor;
      finalTags.push(`quote_author:${normalized}`);
    }
    if (audioUrl) {
        finalTags.push(`audio_url:${audioUrl}`);
        try {
          const raw = localStorage.getItem('music_meta_v1_own');
          if (raw) {
            const map = JSON.parse(raw);
            const meta = map[audioUrl];
            if (meta) {
              if (meta.title) finalTags.push(`audio_title:${meta.title}`);
              if (meta.artist) finalTags.push(`audio_artist:${meta.artist}`);
              if (meta.coverUrl) finalTags.push(`audio_cover:${meta.coverUrl}`);
            }
          }
        } catch {}
    }

    if (type === 'photo' && Array.isArray(uploadedImages) && uploadedImages.length > 1) {
      uploadedImages.slice(1).forEach((url) => {
        if (typeof url === 'string' && url) finalTags.push(`image_url:${url}`);
      });
    }

    if (type === 'photo' || type === 'video') {
      const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
      finalTags.push(`card_pos_x:${clamp(focusX)}`);
      finalTags.push(`card_pos_y:${clamp(focusY)}`);
    }
  if (cardRatio) finalTags.push(`card_ratio:${cardRatio}`);
  if (cardOrient) finalTags.push(`card_orient:${cardOrient}`);
  const legacy = cardOrient === 'vertical' ? 'portrait' : 'landscape';
  finalTags.push(`card_layout:${legacy}`);

  const payload: ClientInsertMemory & { extra?: { audioUrl?: string | null } } = {
      title: title ?? null,
      content,
      type,
      mediaUrl: mediaUrl ?? null,
      thumbnailUrl: thumbnailUrl ?? null,
      visibility: visibility || {},
      tags: finalTags,
  extra: audioUrl ? { audioUrl } : undefined,
  };

  createMemoryMutation.mutate(payload);
  };

  const handleClose = () => {
    form.reset();
    setUploadedImages([]);
    setUploadProgress(null);
  setFocusX(50);
  setFocusY(50);
  setCardRatio('3:4');
  setCardOrient('horizontal');
  onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      setVideoObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setUploadedImages([]);
      setUploadProgress(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialType) {
      form.setValue('type', initialType);
      if (initialType === 'photo' || initialType === 'video') {
        setCardRatio('3:4');
        setCardOrient('horizontal');
      } else {
        setCardRatio('3:4');
        setCardOrient('vertical');
      }
    }
  }, [isOpen, initialType, form]);

  useEffect(() => {
    if (isOpen && editMemory) {
      form.reset();

      if (editMemory.type === 'text' || editMemory.type === 'photo' || editMemory.type === 'video' || editMemory.type === 'quote') {
        form.setValue('type', editMemory.type as "video" | "text" | "photo" | "quote");
      }
      form.setValue('title', editMemory.title || '');
      form.setValue('content', editMemory.content || '');
      form.setValue('mediaUrl', editMemory.mediaUrl || '');
      form.setValue('thumbnailUrl', editMemory.thumbnailUrl || '');
      form.setValue('visibility', (editMemory.visibility as Record<string, unknown> | undefined) ?? {});

      const extraImages = (editMemory.tags || [])
        .filter(t => typeof t === 'string' && t.startsWith('image_url:'))
        .map(t => t.slice('image_url:'.length))
        .filter(Boolean);
      
      if (editMemory.mediaUrl && extraImages.length > 0) {
        setUploadedImages([editMemory.mediaUrl, ...extraImages]);
      } else if (editMemory.mediaUrl) {
        setUploadedImages([editMemory.mediaUrl]);
      }
  
      const audioTag = (editMemory.tags || []).find(t => 
        typeof t === 'string' && t.startsWith('audio_url:')
      );
      if (audioTag) {
        form.setValue('audioUrl', audioTag.slice('audio_url:'.length));
      }

      const posXTag = (editMemory.tags || []).find(t => 
        typeof t === 'string' && t.startsWith('card_pos_x:')
      );
      const posYTag = (editMemory.tags || []).find(t => 
        typeof t === 'string' && t.startsWith('card_pos_y:')
      );
      if (posXTag && posYTag) {
        const x = Number(posXTag.slice('card_pos_x:'.length));
        const y = Number(posYTag.slice('card_pos_y:'.length));
        if (!isNaN(x) && !isNaN(y)) {
          setFocusX(x);
          setFocusY(y);
        }
      }
      const ratioTag = (editMemory.tags || []).find(t => typeof t === 'string' && t.startsWith('card_ratio:')) as string | undefined;
      const orientTag = (editMemory.tags || []).find(t => typeof t === 'string' && t.startsWith('card_orient:')) as string | undefined;
      if (ratioTag) {
        const r = ratioTag.slice('card_ratio:'.length);
        if (r === '9:16' || r === '4:5' || r === '5:7' || r === '3:4' || r === '3:5' || r === '2:3') setCardRatio(r);
      }
      if (orientTag) {
        const o = orientTag.slice('card_orient:'.length);
        if (o === 'vertical' || o === 'horizontal') setCardOrient(o);
      }
      if (!ratioTag) {
        const layoutTag = (editMemory.tags || []).find(t => typeof t === 'string' && t.startsWith('card_layout:')) as string | undefined;
        if (layoutTag) {
          const legacy = layoutTag.slice('card_layout:'.length);
          if (legacy === 'portrait' || legacy === 'tall' || legacy === 'large') {
            setCardRatio('3:4');
            setCardOrient('vertical');
          } else {
            setCardRatio('3:4');
            setCardOrient('horizontal');
          }
        }
      }
    }
  }, [isOpen, editMemory, form, setUploadedImages, setFocusX, setFocusY]);

  const selectedType = form.watch("type");
  useEffect(() => {
    if (selectedType === 'quote') {
      form.setValue('title', '');
    }
    if (!editMemory) {
      if (selectedType === 'photo' || selectedType === 'video') {
        setCardRatio('3:4');
        setCardOrient('horizontal');
      } else {
        setCardRatio('3:4');
        setCardOrient('vertical');
      }
    }
  }, [selectedType, form, editMemory]);
  const selectedTypeOption = memoryTypeOptions.find(option => option.value === selectedType);
  const SelectedIcon = selectedTypeOption?.icon ?? Type;

  const getPreviewAspect = () => {
    const [a, b] = (cardRatio || '3:4').split(':').map((n) => parseInt(n || '0', 10));
    if (!a || !b) return '4 / 3';
    return cardOrient === 'vertical' ? `${a} / ${b}` : `${b} / ${a}`;
  };

  const [dragging, setDragging] = useState(false);
  const setFocusFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setFocusX(Math.max(0, Math.min(100, x)));
    setFocusY(Math.max(0, Math.min(100, y)));
  };

  const uploadImageWithProgress = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload/memory-image');
      xhr.withCredentials = true;
      const fd = new FormData();
      fd.append('image', file);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        setUploadProgress(null);
        try {
          const json = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300 && json?.url) {
            resolve(json.url as string);
          } else {
            reject(new Error(json?.message || 'Ошибка загрузки'));
          }
        } catch {
          reject(new Error('Ошибка загрузки'));
        }
      };
      xhr.onerror = () => {
        setUploadProgress(null);
        reject(new Error('Сетевая ошибка при загрузке'));
      };

      attachCsrfHeader(xhr)
        .then(() => {
          xhr.send(fd);
        })
        .catch(() => {
          setUploadProgress(null);
          reject(new Error('Не удалось подготовить CSRF-защиту'));
        });
    });
  };

  const uploadVideoWithProgress = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload/memory-video');
      xhr.withCredentials = true;
      const fd = new FormData();
      fd.append('video', file);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        setUploadProgress(null);
        try {
          const json = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300 && json?.url) {
            resolve(json.url as string);
          } else {
            reject(new Error(json?.message || 'Ошибка загрузки видео'));
          }
        } catch {
          reject(new Error('Ошибка загрузки видео'));
        }
      };
      xhr.onerror = () => {
        setUploadProgress(null);
        reject(new Error('Сетевая ошибка при загрузке'));
      };

      attachCsrfHeader(xhr)
        .then(() => {
          xhr.send(fd);
        })
        .catch(() => {
          setUploadProgress(null);
          reject(new Error('Не удалось подготовить CSRF-защиту'));
        });
    });
  };

  const captureVideoPoster = (src: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const videoEl = document.createElement('video');
        videoEl.crossOrigin = 'anonymous';
        videoEl.preload = 'auto';
        videoEl.muted = true;
        videoEl.playsInline = true;

        const onError = () => reject(new Error('Не удалось загрузить видео для превью'));
        videoEl.onerror = onError;

        const draw = () => {
          try {
            const w = videoEl.videoWidth || 640;
            const h = videoEl.videoHeight || 360;
            if (!w || !h) return reject(new Error('Видео без размеров'));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas не поддерживается'));
            ctx.drawImage(videoEl, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/png');
            resolve(dataUrl);
          } catch {
            reject(new Error('Браузер запретил доступ к кадру (CORS)'));
          }
        };

        videoEl.onloadedmetadata = () => {
          const target = Math.min((videoEl.duration || 1) * 0.02, 0.1);
          const seekHandler = () => {
            videoEl.removeEventListener('seeked', seekHandler);
            draw();
          };
          videoEl.addEventListener('seeked', seekHandler);
          try {
            videoEl.currentTime = target;
          } catch {
            videoEl.onloadeddata = draw;
          }
        };

        videoEl.src = src;
      } catch (e) {
        reject(e);
      }
    });
  };

  const dataUrlToFile = async (dataUrl: string, filename = 'poster.png'): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    return file;
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImageWithProgress(file);
      setUploadedImages((prev) => {
        const next = [...prev, url];
        form.setValue('mediaUrl', next[0] || '');
        return next;
      });
      toast({ title: 'Изображение загружено', description: 'Файл успешно добавлен' });
    } catch (e) {
  toast({ title: 'Ошибка загрузки', description: (e as Error).message || 'Не удалось загрузить изображение', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    (async () => {
      for (const f of files) {
        await handleImageUpload(f);
      }
    })();
  };

  const removeImageAt = (index: number) => {
    setUploadedImages((prev) => {
      const next = prev.slice();
      next.splice(index, 1);
      form.setValue('mediaUrl', next[0] || '');
      return next;
    });
  };

  const moveImage = (from: number, to: number) => {
    setUploadedImages((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      form.setValue('mediaUrl', next[0] || '');
      return next;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose} data-testid={testId}>
      <DialogContent className="glass-strong max-w-xl p-0 sm:max-h-[85vh] max-h-[90vh] grid grid-rows-[auto,1fr] overflow-hidden">
  <DialogHeader className="flex items-center justify-between p-6 border-b border-border">
          <DialogTitle className="text-xl font-semibold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-strong rounded-full flex items-center justify-center text-primary-foreground">
              <SelectedIcon className="h-5 w-5" />
            </div>
            <span>{editMemory ? "Изменить воспоминание" : "Создать воспоминание"}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {editMemory 
              ? "Форма для редактирования существующего воспоминания с возможностью изменить текст, фото и другие детали"
              : "Форма для создания нового воспоминания с возможностью добавить текст, фото и другие детали"}
          </DialogDescription>
        </DialogHeader>

  <div className="p-6 overflow-y-auto min-h-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid={`${testId}-form`}>
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Тип воспоминания</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid={`${testId}-type-select`}>
                          <SelectValue placeholder="Выберите тип воспоминания" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {memoryTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} data-testid={`${testId}-type-${option.value}`}>
                            <div className="flex items-center gap-2">
                              <option.icon className="h-4 w-4" />
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Выберите тип контента для вашего воспоминания
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedType !== 'quote' && (
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Заголовок (необязательно)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Придумайте заголовок для воспоминания..."
                          {...field}
                          value={field.value || ""}
                          data-testid={`${testId}-title-input`}
                        />
                      </FormControl>
                      <FormDescription>
                        Краткое название для легкого поиска
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Содержимое</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={
                          selectedType === "quote" 
                            ? "Введите цитату или важные слова..." 
                            : selectedType === "text"
                            ? "Опишите ваше воспоминание..."
                            : "Добавьте описание к вашему медиафайлу..."
                        }
                        className="min-h-[120px] resize-none"
                        {...field}
                        value={field.value || ""}
                        data-testid={`${testId}-content-textarea`}
                      />
                    </FormControl>
                    <FormDescription>
                      {selectedType === "quote" && "Поделитесь важной цитатой или высказыванием. Сохранится в кавычках."}
                      {selectedType === "text" && "Расскажите подробно о вашем воспоминании"}
                      {(selectedType === "photo" || selectedType === "video") && "Добавьте описание к вашему медиафайлу"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedType === 'quote' && (
                <QuoteAuthorField form={form} testId={testId} />
              )}

              <FormField
                control={form.control}
                name="locationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Место (необязательно)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Например: Москва, Парк Горького"
                        {...field}
                        value={field.value || ""}
                        data-testid={`${testId}-location-input`}
                      />
                    </FormControl>
                    <FormDescription>
                      Будет учитываться в статистике «Мест посещено».
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel>Ориентация</FormLabel>
                  <span className="text-xs text-muted-foreground">Влияет на высоту карточки в сетке</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: 'horizontal', label: 'Горизонтальная' },
                    { key: 'vertical', label: 'Вертикальная' },
                  ] as const).map((opt) => (
                    <button
                      type="button"
                      key={opt.key}
                      onClick={() => setCardOrient(opt.key)}
                      aria-pressed={cardOrient === opt.key}
                      data-testid={`${testId}-orient-${opt.key}`}
                      className={`group relative flex items-center justify-center gap-2 rounded-md border p-2 transition-colors select-none ${cardOrient === opt.key ? 'border-primary ring-2 bg-accent' : 'hover:bg-muted'}`}
                      title={opt.label}
                    >
                      <div className="w-14 h-9 bg-muted rounded-sm shadow-inner flex items-center justify-center">
                        {opt.key === 'horizontal' ? (
                          <div className="w-10 h-6 bg-secondary rounded" />
                        ) : (
                          <div className="w-6 h-10 bg-secondary rounded" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground group-aria-[pressed=true]:text-primary">{opt.label}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <FormLabel>Вид карточки</FormLabel>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {([
                      '9:16','4:5','5:7','3:4','3:5','2:3'
                    ] as const).map((ratio) => (
                      <button
                        type="button"
                        key={ratio}
                        onClick={() => setCardRatio(ratio)}
                        aria-pressed={cardRatio === ratio}
                        data-testid={`${testId}-ratio-${ratio.replace(':','-')}`}
                        className={`group relative flex flex-col items-center justify-center gap-1 rounded-md border p-2 transition-colors select-none ${cardRatio === ratio ? 'border-primary ring-2 bg-accent' : 'hover:bg-muted'}`}
                        title={ratio}
                      >
                        <div className="w-full flex items-center justify-center">
                          {cardOrient === 'vertical' ? (
                            ratio === '9:16' ? <div className="w-8 h-14 bg-muted rounded-sm shadow-inner" /> :
                            ratio === '4:5'  ? <div className="w-9 h-12 bg-muted rounded-sm shadow-inner" /> :
                            ratio === '5:7'  ? <div className="w-9 h-14 bg-muted rounded-sm shadow-inner" /> :
                            ratio === '3:4'  ? <div className="w-9 h-12 bg-muted rounded-sm shadow-inner" /> :
                            ratio === '3:5'  ? <div className="w-8 h-14 bg-muted rounded-sm shadow-inner" /> :
                            /* 2:3 */       <div className="w-8 h-12 bg-muted rounded-sm shadow-inner" />
                          ) : (
                            ratio === '9:16' ? <div className="w-14 h-8 bg-muted rounded-sm shadow-inner" /> :
                            ratio === '4:5'  ? <div className="w-12 h-9 bg-muted rounded-sm shadow-inner" /> :
                            ratio === '5:7'  ? <div className="w-14 h-9 bg-muted rounded-sm shadow-inner" /> :
                            ratio === '3:4'  ? <div className="w-12 h-9 bg-muted rounded-sm shadow-inner" /> :
                            ratio === '3:5'  ? <div className="w-14 h-8 bg-muted rounded-sm shadow-inner" /> :
                            /* 2:3 */       <div className="w-12 h-8 bg-muted rounded-sm shadow-inner" />
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground group-aria-[pressed=true]:text-primary">{ratio}</span>
                      </button>
                    ))}
                  </div>
                  <FormDescription>
                    Можно менять в любое время при редактировании. Для фото/видео по умолчанию — 3:4 горизонтальная.
                  </FormDescription>
                </div>
              </div>

              <AttachAudioField form={form} testId={testId} />

              {selectedType === "photo" && (
                <FormItem>
                  <FormLabel>Изображения</FormLabel>
                  <div className="flex flex-col gap-3">
                    <Input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFilesSelected}
                      disabled={uploading}
                    />

                    {uploading && (
                      <div className="h-2 w-full bg-muted rounded">
                        <div
                          className="h-2 bg-primary rounded transition-all"
                          style={{ width: `${uploadProgress ?? 0}%` }}
                        />
                      </div>
                    )}

                    {uploadedImages.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Перетащите, чтобы изменить порядок. Первый — обложка.</p>
                        <ul className="grid grid-cols-3 gap-3">
                          {uploadedImages.map((url, idx) => (
                            <li
                              key={url}
                              className="relative group border rounded overflow-hidden bg-muted"
                              draggable
                              onDragStart={() => setDragIndex(idx)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (dragIndex === null || dragIndex === idx) return;
                                moveImage(dragIndex, idx);
                                setDragIndex(null);
                              }}
                            >
                              <img src={url} alt={`Загруженное ${idx + 1}`} className="w-full h-24 object-cover" />
                              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-1.5 py-1 bg-background text-text-primary text-xs">
                                <span className="flex items-center gap-1">
                                  <GripVertical className="h-3.5 w-3.5" />
                                  {idx + 1}
                                </span>
                                {idx === 0 && (
                                  <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Обложка</span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="absolute top-1 right-1 inline-flex items-center justify-center rounded bg-background text-text-primary p-1 opacity-0 group-hover:opacity-100 transition"
                                onClick={() => removeImageAt(idx)}
                                title="Удалить"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                        {uploadedImages[0] && (
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">Превью соответствует выбранным пропорциям. Кликните или перетаскивайте для выбора фокуса.</p>
                            <div
                              className="relative rounded border overflow-hidden bg-muted select-none touch-none mx-auto"
                              style={{ aspectRatio: getPreviewAspect(), width: 'min(100%, 260px)' }}
                              onPointerDown={(e) => { setDragging(true); setFocusFromEvent(e); e.currentTarget.setPointerCapture(e.pointerId); }}
                              onPointerMove={(e) => { if (dragging) setFocusFromEvent(e); }}
                              onPointerUp={() => setDragging(false)}
                              onPointerCancel={() => setDragging(false)}
                              title="Кликните или перетаскивайте, чтобы задать фокус"
                            >
                              <img
                                src={uploadedImages[0]}
                                alt="Превью для карточки"
                                className="absolute inset-0 w-full h-full object-cover"
                                style={{ objectPosition: `${focusX}% ${focusY}%` }}
                              />
                              <div
                                className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-primary border border-background shadow"
                                style={{ left: `${focusX}%`, top: `${focusY}%` }}
                              />
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>X: {Math.round(focusX)}%</span>
                              <span>Y: {Math.round(focusY)}%</span>
                              <Button type="button" variant="ghost" size="sm" onClick={() => { setFocusX(50); setFocusY(50); }}>Сбросить</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <FormDescription>
                    {`Загрузите одно или несколько фото. Поддерживаются JPG, PNG, GIF, WebP. Максимум ${formatMaxSizeMb(MEMORY_IMAGE_MAX_SIZE)} на файл. Первый в списке станет обложкой.`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}

              {selectedType === "video" && (
                <FormItem>
                  <FormLabel>Видео</FormLabel>
                  <div className="flex flex-col gap-3">
                    <Input
                      type="file"
                      accept="video/*,.mp4,.mov,.m4v,.webm,.ogv,.mkv,.avi,.flv"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        try {
                          const url = await uploadVideoWithProgress(file);
                          form.setValue('mediaUrl', url || '');
                          try {
                            if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
                          } catch {}
                          setVideoObjectUrl(URL.createObjectURL(file));
                          toast({ title: 'Видео загружено', description: 'Файл успешно добавлен' });
                        } catch (e) {
                          toast({ title: 'Ошибка загрузки', description: (e as Error).message || 'Не удалось загрузить видео', variant: 'destructive' });
                        } finally {
                          setUploading(false);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      disabled={uploading}
                    />

                    {uploading && (
                      <div className="h-2 w-full bg-muted rounded">
                        <div
                          className="h-2 bg-primary rounded transition-all"
                          style={{ width: `${uploadProgress ?? 0}%` }}
                        />
                      </div>
                    )}

                    {form.watch('mediaUrl') && (
                      <div className="text-sm text-muted-foreground">
                        Загружено: <span className="font-mono break-all">{form.watch('mediaUrl')}</span>
                      </div>
                    )}

                    {(videoObjectUrl || form.watch('mediaUrl')) && (
                      <div className="space-y-2">
                        <video
                          src={videoObjectUrl || form.watch('mediaUrl') || undefined}
                          controls
                          className="w-full max-h-64 bg-black rounded"
                        />

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={async () => {
                              const src = videoObjectUrl || form.getValues('mediaUrl') || '';
                              if (!src) return;
                              try {
                                const dataUrl = await captureVideoPoster(src);
                                const file = await dataUrlToFile(dataUrl, 'video_poster.png');
                                const uploadedUrl = await uploadImageWithProgress(file);
                                form.setValue('thumbnailUrl', uploadedUrl);
                                toast({ title: 'Превью создано', description: 'Кадр сохранён как превью' });
                              } catch (err) {
                                toast({ title: 'Не удалось создать превью', description: (err as Error).message || 'Ошибка при создании превью', variant: 'destructive' });
                              }
                            }}
                          >
                            Сделать кадр как превью
                          </Button>
                          <div>
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const url = await uploadImageWithProgress(file);
                                  form.setValue('thumbnailUrl', url || null);
                                  toast({ title: 'Превью загружено', description: 'Изображение сохранено как превью' });
                                } catch (err) {
                                  toast({ title: 'Ошибка загрузки превью', description: (err as Error).message || 'Не удалось загрузить изображение', variant: 'destructive' });
                                } finally {
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }}
                            />
                          </div>
                        </div>

                        {form.watch('thumbnailUrl') && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <img src={form.watch('thumbnailUrl') || ''} alt="Превью" className="w-24 h-16 object-cover rounded border" />
                              <div className="text-xs text-muted-foreground">Превью установлено</div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">Превью соответствует выбранным пропорциям. Кликните или перетаскивайте для выбора фокуса.</p>
                              <div
                                className="relative rounded border overflow-hidden bg-muted select-none touch-none mx-auto"
                                style={{ aspectRatio: getPreviewAspect(), width: 'min(100%, 260px)' }}
                                onPointerDown={(e) => { setDragging(true); setFocusFromEvent(e); e.currentTarget.setPointerCapture(e.pointerId); }}
                                onPointerMove={(e) => { if (dragging) setFocusFromEvent(e); }}
                                onPointerUp={() => setDragging(false)}
                                onPointerCancel={() => setDragging(false)}
                                title="Кликните или перетаскивайте, чтобы задать фокус"
                              >
                                <img
                                  src={form.watch('thumbnailUrl') || ''}
                                  alt="Превью для карточки"
                                  className="absolute inset-0 w-full h-full object-cover"
                                  style={{ objectPosition: `${focusX}% ${focusY}%` }}
                                />
                                <div
                                  className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-primary border border-background shadow"
                                  style={{ left: `${focusX}%`, top: `${focusY}%` }}
                                />
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>X: {Math.round(focusX)}%</span>
                                <span>Y: {Math.round(focusY)}%</span>
                                <Button type="button" variant="ghost" size="sm" onClick={() => { setFocusX(50); setFocusY(50); }}>Сбросить</Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <FormDescription>
                    {`Загрузите видео (MP4, WebM, OGG, MOV, MKV, AVI, FLV и др.). Максимум ${formatMaxSizeMb(MEMORY_VIDEO_MAX_SIZE)}. Хранится локально в /uploads/memories.`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1"
                  data-testid={`${testId}-cancel-button`}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMemoryMutation.isPending ||
                    uploading ||
                    ((selectedType === 'photo' || selectedType === 'video') && !form.getValues('mediaUrl'))
                  }
                  className="flex-1 btn-gradient"
                  data-testid={`${testId}-submit-button`}
                >
                  {createMemoryMutation.isPending 
                    ? (editMemory ? "Обновление..." : "Создание...") 
                    : (editMemory ? "Обновить воспоминание" : "Создать воспоминание")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttachAudioField({ form, testId }: { form: UseFormReturn<CreateMemoryFormValues>; testId?: string }) {
  const { data, isLoading } = useQuery<{ audios: { url: string; name: string }[] }>({
    queryKey: ['/api/audios'],
    queryFn: async () => {
      const res = await apiRequest('/api/audios', 'GET');
      if (!res.ok) return { audios: [] };
      return await res.json();
    },
    staleTime: 60_000,
  });

  const value: string | null = form.watch('audioUrl');
  const list = (data?.audios || []).slice(0, 200);

  const getMetaMap = (): Record<string, { title: string; artist?: string }> => {
    try {
      const keys = ['music_meta_v1', 'music_meta_v1_own', 'music_meta_v1_partner'];
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const map = JSON.parse(raw) as Record<string, { title: string; artist?: string }>;
        if (Object.keys(map).length > 0) return map;
      }
    } catch {}
    return {};
  };
  const metaMap = getMetaMap();
  const options = list.map((a) => {
    const baseName = (a.name || '').replace(/\.[^.]+$/, '') || 'Аудио';
    const m = metaMap[a.url];
    const title = (m?.title || baseName) as string;
    const artist = (m?.artist || '').trim();
    const label = artist ? `${artist} — ${title}` : title;
    return { url: a.url, label };
  });

  return (
    <FormField
      control={form.control}
      name="audioUrl"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Привязать трек (необязательно)</FormLabel>
          <div className="flex gap-2 items-center">
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={field.value || ''}
              onChange={(e) => field.onChange(e.target.value || null)}
              disabled={isLoading}
              data-testid={`${testId}-audio-select`}
            >
              <option value="">— Не привязывать —</option>
              {options.map((o) => (
                <option key={o.url} value={o.url}>{o.label}</option>
              ))}
            </select>
            {value && (
              <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('audioUrl', null)}>Убрать</Button>
            )}
          </div>
          <FormDescription>Выберите аудио из ранее загруженных на странице «Музыка».</FormDescription>
        </FormItem>
      )}
    />
  );
}

function QuoteAuthorField({ form, testId }: { form: UseFormReturn<CreateMemoryFormValues>; testId?: string }) {
  const { data: me } = useQuery<{ id: string; username: string } | null>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const res = await apiRequest("/api/user", "GET");
      if (!res.ok) return null;
      return await res.json();
    },
  });
  const { data: partnerResp } = useQuery<{ partner: { id: string; username: string } | null }>({
    queryKey: ["/api/partner"],
    queryFn: async () => {
      const res = await apiRequest("/api/partner", "GET");
      if (!res.ok) return { partner: null };
      return await res.json();
    },
    enabled: true,
  });

  const users = [
    me?.username ? { id: me!.id, username: me!.username } : null,
    partnerResp?.partner ? { id: partnerResp.partner.id, username: partnerResp.partner.username } : null,
  ].filter(Boolean) as Array<{ id: string; username: string }>;

  const [open, setOpen] = useState(false);
  const value: string = form.watch('quoteAuthor') || '';

  const filtered = users
    .filter(u => u.username.toLowerCase().includes(value.replace(/^@+/, '').toLowerCase()))
    .slice(0, 6);

  return (
    <FormField
      control={form.control}
      name="quoteAuthor"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Автор</FormLabel>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <div>
                <Input
                  placeholder="Начните вводить никнейм или имя автора…"
                  {...field}
                  value={field.value || ''}
                  data-testid={`${testId}-quote-author-input`}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
              <Command>
                <CommandInput placeholder="Поиск пользователя…" />
                <CommandEmpty>Не найдено. Нажмите Enter, чтобы использовать свой вариант.</CommandEmpty>
                {users.length > 0 && (
                  <CommandGroup heading="Доступные пользователи">
                    {filtered.map((u) => (
                      <CommandItem
                        key={u.id}
                        value={u.username}
                        onSelect={(val) => {
                          form.setValue('quoteAuthor', `@${val}`);
                          setOpen(false);
                        }}
                      >
                        @{u.username}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </Command>
            </PopoverContent>
          </Popover>
          <FormDescription>
            Выберите автора из списка или введите свой вручную. Сохранится с префиксом @.
          </FormDescription>
        </FormItem>
      )}
    />
  );
}
