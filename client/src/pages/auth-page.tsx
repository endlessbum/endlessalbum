import { useState } from "react";
const translations = {
  ru: {
    login: "Вход",
    register: "Регистрация",
    invite: "Приглашение",
    emailOrUsername: "Email или никнейм",
    password: "Пароль",
    forgotPassword: "Забыли пароль?",
    loginButton: "Войти",
    loginPending: "Вход...",
    registerButton: "Зарегистрироваться",
    registerPending: "Регистрация...",
    confirmPassword: "Подтверждение пароля",
    privacy: "Продолжая, вы соглашаетесь с нашей ",
    privacyLink: "Политикой конфиденциальности",
    inviteExisting: "У меня есть аккаунт",
    inviteNew: "У меня нет аккаунта",
    joinExisting: "Присоединиться",
    joinPending: "Присоединение...",
    joinNew: "Зарегистрироваться и присоединиться",
    inviteCode: "Код приглашения",
    createPassword: "Создайте пароль",
    repeatPassword: "Повторите пароль",
    chooseUsername: "Выберите никнейм",
    enterEmail: "Введите email",
    manifesto: `— это не просто альбом.\nЭто общее пространство для вашей истории, созданное с заботой и вниманием к деталям. Здесь каждая фотография, каждое слово и каждое мгновение остаются рядом с вами — бережно сохранённые, защищённые и доступные всегда.\n\nМы верим, что воспоминания живут, пока их хранят.\nПоэтому Endlessalbum помогает вам не только собирать важные события, но и делиться ими в атмосфере доверия, уюта и приватности.\n\nСоздавайте, играйте, говорите, вспоминайте.\nEndlessalbum — это бесконечный альбом вашей близости.`
  },
  en: {
    login: "Login",
    register: "Register",
    invite: "Invite",
    emailOrUsername: "Email or username",
    password: "Password",
    forgotPassword: "Forgot password?",
    loginButton: "Login",
    loginPending: "Logging in...",
    registerButton: "Register",
    registerPending: "Registering...",
    confirmPassword: "Confirm password",
    privacy: "By continuing, you agree to our ",
    privacyLink: "Privacy Policy",
    inviteExisting: "I have an account",
    inviteNew: "I don't have an account",
    joinExisting: "Join",
    joinPending: "Joining...",
    joinNew: "Register and join",
    inviteCode: "Invite code",
    createPassword: "Create password",
    repeatPassword: "Repeat password",
    chooseUsername: "Choose username",
    enterEmail: "Enter email",
    manifesto: `— is not just an album.\nIt's a shared space for your story, created with care and attention to detail. Here every photo, every word, and every moment stays close to you — carefully preserved, protected, and always accessible.\n\nWe believe memories live as long as they are kept.\nThat's why Endlessalbum helps you not only collect important events, but also share them in an atmosphere of trust, comfort, and privacy.\n\nCreate, play, talk, remember.\nEndlessalbum is the endless album of your closeness.`
  }
};
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logoUrl from "@/assets/logo.png";

export default function AuthPage() {
  const [lang, setLang] = useState<'ru' | 'en'>(localStorage.getItem('ui:lang') === 'en' ? 'en' : 'ru');
  const handleLangChange = (newLang: 'ru' | 'en') => {
    setLang(newLang);
    localStorage.setItem('ui:lang', newLang);
  };
  const { user, isLoading, loginMutation, registerMutation, joinWithInviteMutation, registerWithInviteMutation } = useAuth();
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [inviteMode, setInviteMode] = useState<'existing' | 'new'>('existing');
  const [agreeRegister, setAgreeRegister] = useState(false);
  const [agreeInviteNew, setAgreeInviteNew] = useState(false);
  const { toast } = useToast();

  const handleForgotPassword = () => {
    toast({
      title: lang === 'ru' ? 'Восстановление пароля' : 'Password recovery',
      description:
        lang === 'ru'
          ? 'Функция восстановления пароля пока недоступна. Обратитесь к администратору приложения.'
          : 'Password recovery is not available yet. Please contact the application administrator.',
      variant: 'destructive',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (user) {
    return <Redirect to="/" />;
  }

  const togglePasswordVisibility = (field: string) => {
    setShowPassword(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    loginMutation.mutate({
      username: formData.get('username') as string,
      password: formData.get('password') as string,
    });
  };

  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!agreeRegister) {
      toast({
        title: lang === 'ru' ? 'Нужно согласие' : 'Consent required',
        description:
          lang === 'ru'
            ? 'Пожалуйста, подтвердите согласие с Политикой конфиденциальности'
            : 'Please confirm your agreement with the Privacy Policy',
        variant: 'destructive',
      });
      return;
    }
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    
    if (password !== confirmPassword) {
      toast({
        title: lang === 'ru' ? 'Пароли не совпадают' : 'Passwords do not match',
        description: lang === 'ru' ? 'Введите одинаковые пароли' : 'Enter matching passwords',
        variant: 'destructive',
      });
      return;
    }

    registerMutation.mutate({
      email: formData.get('email') as string,
      username: formData.get('username') as string,
      password: password,
    });
  };

  const handleJoinWithInvite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    joinWithInviteMutation.mutate({
      username: formData.get('username') as string,
      password: formData.get('password') as string,
      inviteCode: formData.get('inviteCode') as string,
    });
  };

  const handleRegisterWithInvite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!agreeInviteNew) {
      toast({
        title: lang === 'ru' ? 'Нужно согласие' : 'Consent required',
        description:
          lang === 'ru'
            ? 'Пожалуйста, подтвердите согласие с Политикой конфиденциальности'
            : 'Please confirm your agreement with the Privacy Policy',
        variant: 'destructive',
      });
      return;
    }
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    
    if (password !== confirmPassword) {
      toast({
        title: lang === 'ru' ? 'Пароли не совпадают' : 'Passwords do not match',
        description: lang === 'ru' ? 'Введите одинаковые пароли' : 'Enter matching passwords',
        variant: 'destructive',
      });
      return;
    }

    registerWithInviteMutation.mutate({
      email: formData.get('email') as string,
      username: formData.get('username') as string,
      password: password,
      inviteCode: formData.get('inviteCode') as string,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" data-testid="auth-page">
  <div className="w-full max-w-6xl flex flex-col-reverse md:flex-row gap-6 md:gap-10">
  <div className="w-full md:flex-1 flex flex-col justify-center items-center rounded-2xl p-6 md:p-10 mt-4 md:mt-0">
          <div className="text-center">
            <img 
              src={logoUrl} 
              alt="Endlessalbum Logo"
              className="w-16 h-16 mx-auto mb-6 rounded-full object-contain"
            />
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-text-primary mb-4">Endlessalbum</h1>
            <p className="text-text-secondary text-base leading-relaxed max-w-md whitespace-pre-line">
              {translations[lang].manifesto}
            </p>
          </div>
        </div>

  <div className="w-full md:flex-1">
          <div className="rounded-2xl p-6 md:p-8 border border-border-subtle bg-surface shadow-sm">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger className="flex-1" value="login" data-testid="tab-login">{translations[lang].login}</TabsTrigger>
                <TabsTrigger className="flex-1" value="register" data-testid="tab-register">{translations[lang].register}</TabsTrigger>
                <TabsTrigger className="flex-1" value="invite" data-testid="tab-invite">{translations[lang].invite}</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
                <form onSubmit={handleLogin} className="space-y-4" data-testid="form-login">
                  <div>
                    <Label htmlFor="login-username">{translations[lang].emailOrUsername}</Label>
                    <Input
                      id="login-username"
                      name="username"
                      type="text"
                      placeholder={translations[lang].emailOrUsername}
                      required
                      data-testid="input-username"
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-password">{translations[lang].password}</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        name="password"
                        type={showPassword.loginPassword ? "text" : "password"}
                        placeholder={translations[lang].password}
                        required
                        data-testid="input-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility('loginPassword')}
                        data-testid="button-toggle-password"
                        aria-label={showPassword.loginPassword ? 'Скрыть пароль' : 'Показать пароль'}
                      >
                        {showPassword.loginPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full btn-gradient" 
                    disabled={loginMutation.isPending}
                    data-testid="button-login"
                  >
                    {loginMutation.isPending ? translations[lang].loginPending : translations[lang].loginButton}
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="w-full"
                    onClick={handleForgotPassword}
                    data-testid="button-forgot-password"
                  >
                    {translations[lang].forgotPassword}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="space-y-4">
                <form onSubmit={handleRegister} className="space-y-4" data-testid="form-register">
                  <div>
                    <Label htmlFor="register-email">{translations[lang].emailOrUsername}</Label>
                    <Input
                      id="register-email"
                      name="email"
                      type="email"
                      placeholder={translations[lang].enterEmail}
                      required
                      data-testid="input-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="register-username">{translations[lang].chooseUsername}</Label>
                    <Input
                      id="register-username"
                      name="username"
                      type="text"
                      placeholder={translations[lang].chooseUsername}
                      required
                      data-testid="input-register-username"
                    />
                  </div>
                  <div>
                    <Label htmlFor="register-password">{translations[lang].password}</Label>
                    <div className="relative">
                      <Input
                        id="register-password"
                        name="password"
                        type={showPassword.registerPassword ? "text" : "password"}
                        placeholder={translations[lang].createPassword}
                        required
                        data-testid="input-register-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility('registerPassword')}
                        data-testid="button-toggle-register-password"
                        aria-label={showPassword.registerPassword ? 'Скрыть пароль' : 'Показать пароль'}
                      >
                        {showPassword.registerPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="confirm-password">{translations[lang].confirmPassword}</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        name="confirmPassword"
                        type={showPassword.confirmPassword ? "text" : "password"}
                        placeholder={translations[lang].repeatPassword}
                        required
                        data-testid="input-confirm-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility('confirmPassword')}
                        data-testid="button-toggle-confirm-password"
                      >
                        {showPassword.confirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-text-muted">
                    <Checkbox id="agree-register" checked={agreeRegister} onCheckedChange={(v) => setAgreeRegister(Boolean(v))} />
                    <label htmlFor="agree-register" className="leading-5">
                      {translations[lang].privacy}
                      <a href="/privacy" className="underline hover:text-text-primary">{translations[lang].privacyLink}</a>.
                    </label>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full btn-gradient" 
                    disabled={registerMutation.isPending || !agreeRegister}
                    data-testid="button-register"
                  >
                    {registerMutation.isPending ? translations[lang].registerPending : translations[lang].registerButton}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="invite" className="space-y-4">
                <div className="mb-6">
                  <Tabs value={inviteMode} onValueChange={(value) => setInviteMode(value as 'existing' | 'new')}>
                    <TabsList className="w-full">
                      <TabsTrigger className="flex-1" value="existing" data-testid="invite-existing">{translations[lang].inviteExisting}</TabsTrigger>
                      <TabsTrigger className="flex-1" value="new" data-testid="invite-new">{translations[lang].inviteNew}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="existing" className="space-y-4 mt-4">
                      <form onSubmit={handleJoinWithInvite} className="space-y-4" data-testid="invite-existing-form">
                        <div>
                          <Label htmlFor="invite-existing-username">{translations[lang].emailOrUsername}</Label>
                          <Input
                            id="invite-existing-username"
                            name="username"
                            type="text"
                            placeholder={translations[lang].emailOrUsername}
                            required
                            data-testid="input-invite-username"
                          />
                        </div>
                        <div>
                          <Label htmlFor="invite-existing-password">{translations[lang].password}</Label>
                          <div className="relative">
                            <Input
                              id="invite-existing-password"
                              name="password"
                              type={showPassword.inviteExistingPassword ? "text" : "password"}
                              placeholder={translations[lang].password}
                              required
                              data-testid="input-invite-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => togglePasswordVisibility('inviteExistingPassword')}
                              data-testid="button-toggle-invite-password"
                              aria-label={showPassword.inviteExistingPassword ? 'Скрыть пароль' : 'Показать пароль'}
                            >
                              {showPassword.inviteExistingPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="invite-existing-code">{translations[lang].inviteCode}</Label>
                          <Input
                            id="invite-existing-code"
                            name="inviteCode"
                            type="text"
                            placeholder="XXXX-XXXX-XXXX"
                            className="font-mono tracking-wider uppercase"
                            required
                            data-testid="input-invite-code"
                          />
                        </div>
                        <Button 
                          type="submit" 
                          className="w-full btn-gradient"
                          disabled={joinWithInviteMutation.isPending}
                          data-testid="button-join-existing"
                        >
                          {joinWithInviteMutation.isPending ? translations[lang].joinPending : translations[lang].joinExisting}
                        </Button>
                      </form>
                    </TabsContent>

                    <TabsContent value="new" className="space-y-4 mt-4">
                      <form onSubmit={handleRegisterWithInvite} className="space-y-4" data-testid="invite-new-form">
                        <div>
                          <Label htmlFor="invite-new-email">{translations[lang].emailOrUsername}</Label>
                          <Input
                            id="invite-new-email"
                            name="email"
                            type="email"
                            placeholder={translations[lang].enterEmail}
                            required
                            data-testid="input-invite-email"
                          />
                        </div>
                        <div>
                          <Label htmlFor="invite-new-username">{translations[lang].chooseUsername}</Label>
                          <Input
                            id="invite-new-username"
                            name="username"
                            type="text"
                            placeholder={translations[lang].chooseUsername}
                            required
                            data-testid="input-invite-new-username"
                          />
                        </div>
                        <div>
                          <Label htmlFor="invite-new-password">{translations[lang].password}</Label>
                          <div className="relative">
                            <Input
                              id="invite-new-password"
                              name="password"
                              type={showPassword.inviteNewPassword ? "text" : "password"}
                              placeholder={translations[lang].createPassword}
                              required
                              data-testid="input-invite-new-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => togglePasswordVisibility('inviteNewPassword')}
                              data-testid="button-toggle-invite-new-password"
                              aria-label={showPassword.inviteNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
                            >
                              {showPassword.inviteNewPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="invite-new-confirm">{translations[lang].confirmPassword}</Label>
                          <div className="relative">
                            <Input
                              id="invite-new-confirm"
                              name="confirmPassword"
                              type={showPassword.inviteNewConfirm ? "text" : "password"}
                              placeholder={translations[lang].repeatPassword}
                              required
                              data-testid="input-invite-confirm-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => togglePasswordVisibility('inviteNewConfirm')}
                              data-testid="button-toggle-invite-new-password"
                              aria-label={showPassword.inviteNewConfirm ? 'Скрыть пароль' : 'Показать пароль'}
                            >
                              {showPassword.inviteNewConfirm ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="invite-new-code">{translations[lang].inviteCode}</Label>
                          <Input
                            id="invite-new-code"
                            name="inviteCode"
                            type="text"
                            placeholder="XXXX-XXXX-XXXX"
                            className="font-mono tracking-wider uppercase"
                            required
                            data-testid="input-invite-new-code"
                          />
                        </div>
                        <div className="flex items-start gap-2 text-xs text-text-muted">
                          <Checkbox id="agree-invite-new" checked={agreeInviteNew} onCheckedChange={(v) => setAgreeInviteNew(Boolean(v))} />
                          <label htmlFor="agree-invite-new" className="leading-5">
                            {translations[lang].privacy}
                            <a href="/privacy" className="underline hover:text-text-primary">{translations[lang].privacyLink}</a>.
                          </label>
                        </div>
                        <Button 
                          type="submit" 
                          className="w-full btn-gradient"
                          disabled={registerWithInviteMutation.isPending || !agreeInviteNew}
                          data-testid="button-join-new"
                        >
                          {registerWithInviteMutation.isPending ? translations[lang].joinPending : translations[lang].joinNew}
                        </Button>
                      </form>
                    </TabsContent>
                  </Tabs>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-center mt-6 mb-2">
              <Button
                variant="default"
                className="mx-2"
                onClick={() => handleLangChange(lang === 'ru' ? 'en' : 'ru')}
                aria-label="Переключить язык"
                data-testid="lang-toggle"
              >{lang === 'ru' ? 'Ru' : 'En'}</Button>
            </div>
          </div>
        </div>
      </div>

  <footer className="auth-footer text-center py-6 text-sm text-muted-foreground pb-safe">
        © 2025 — {new Date().getFullYear()} Endlessalbum · Создано с заботой о пользователях
        <span className="block mt-1">
          <a href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-privacy">
            Политика конфиденциальности
          </a>
          {' '}
          ·
          {' '}
          <a href="/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">
            Пользовательское соглашение
          </a>
        </span>
      </footer>
    </div>
  );
}
