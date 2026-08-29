import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { csrfUploadFetch } from "@/lib/queryClient";
import { AVATAR_MAX_SIZE } from "@shared/constants";
import { formatMaxSizeMb } from "@shared/utils";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  username?: string;
  onAvatarChange?: (newAvatarUrl: string) => void;
}

export function AvatarUpload({ currentAvatarUrl, username, onAvatarChange }: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);

      const formData = new FormData();
      formData.append('avatar', file);
      
      const response = await csrfUploadFetch('/api/upload/avatar', 'POST', formData);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData: { message?: string; error?: string } | null = null;
        try {
          errorData = JSON.parse(errorText);
        } catch {}
        throw new Error(errorData?.message || errorData?.error || errorText || 'Failed to upload avatar');
      }
      
      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Аватар обновлен",
        description: "Ваш аватар успешно загружен"
      });
      if (onAvatarChange) {
        onAvatarChange(data.url);
      }
      setIsUploading(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка загрузки",
        description: error.message || "Не удалось загрузить аватар",
        variant: "destructive"
      });
      setIsUploading(false);
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Неверный тип файла",
        description: "Пожалуйста, выберите изображение",
        variant: "destructive"
      });
      return;
    }

    if (file.size > AVATAR_MAX_SIZE) {
      toast({
        title: "Файл слишком большой",
        description: `Максимальный размер файла: ${formatMaxSizeMb(AVATAR_MAX_SIZE)}`,
        variant: "destructive"
      });
      return;
    }

    uploadMutation.mutate(file);
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="text-center">
      <div className="relative inline-block">
        {currentAvatarUrl ? (
          <img
            src={currentAvatarUrl}
            alt="Avatar"
            className="w-32 h-32 rounded-full object-cover mx-auto mb-4"
          />
        ) : (
          <div className="w-32 h-32 bg-accent-strong rounded-full flex items-center justify-center text-primary-foreground text-4xl font-bold mx-auto mb-4">
            {username?.charAt(0).toUpperCase() || 'U'}
          </div>
        )}
        
        <Button
          type="button"
          size="icon"
          className="absolute bottom-2 right-2 rounded-full"
          onClick={handleCameraClick}
          disabled={isUploading}
          aria-label="Загрузить аватар"
          title="Загрузить аватар"
          data-testid="button-upload-avatar"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-avatar-file"
      />
    </div>
  );
}
