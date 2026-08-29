import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { HelpCircle, Lightbulb, Users, Timer, Check, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { subscribeWs, sendWs } from "@/lib/ws";
import { type PartnerResponse, type TwentyQuestionsMessage } from "@shared/schema";
import { GameType } from "@shared/ws-messages";

interface TwentyQuestionsProps {
  gameId: string;
  onBack: () => void;
}

interface Question {
  id: string;
  question: string;
  answer: 'yes' | 'no' | null;
  askerId: string;
}

export default function TwentyQuestionsGame({ gameId, onBack }: TwentyQuestionsProps) {
  const { user } = useAuth();
  const [gamePhase, setGamePhase] = useState<'setup' | 'thinking' | 'guessing' | 'finished'>('setup');
  const [myWord, setMyWord] = useState('');
  const myWordRef = useRef('');
  // partnerWord is not used currently; removed to avoid confusion
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionsLeft, setQuestionsLeft] = useState(20);
  const [finalGuess, setFinalGuess] = useState('');
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [waitingForPartner, setWaitingForPartner] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [gameResult, setGameResult] = useState<'won' | 'lost' | null>(null);
  // WS partner_status_change приходит только в момент коннекта сокета; если
  // компонент подписался позже — досинхронизируемся из REST-снимка /api/partner.
  const wsStatusReceivedRef = useRef(false);

  // Помнят, что партнёр уже загадал слово и кто он — иначе игрок, загадавший
  // слово первым, навсегда застревает в фазе thinking (партнёр уже ушёл в
  // guessing, его word_set приходит ДО нашего).
  const partnerWordSetRef = useRef(false);
  const partnerUserIdRef = useRef<string>('');
  const gameCompletedSentRef = useRef(false);

  const { data: partnerData } = useQuery<PartnerResponse>({
    queryKey: ["/api/partner"],
  });

  const sendGameMessage = useCallback((action: string, data: unknown) => {
    sendWs({
      type: 'game_action',
      gameType: GameType.TWENTY_QUESTIONS,
      gameId,
      action,
      data,
      senderId: user?.id
    });
  }, [gameId, user?.id]);

  const sendCompletedIfNeeded = useCallback(() => {
    if (!gameCompletedSentRef.current) {
      gameCompletedSentRef.current = true;
      sendGameMessage('game_completed', { result: 'finished' });
    }
  }, [sendGameMessage]);

  const handleGameMessage = useCallback((data: TwentyQuestionsMessage) => {
    const payload = (data as TwentyQuestionsMessage & { data: any }).data ?? {};
    switch (data.action) {
      case 'word_set':
        if (data.senderId !== user?.id) {
          partnerWordSetRef.current = true;
          if (data.senderId) partnerUserIdRef.current = data.senderId;
          setWaitingForPartner(false);
          if (myWordRef.current) {
            setGamePhase('guessing');
            // Кто начинает — определяем детерминированно (меньший id), чтобы
            // оба клиента выбрали одинакового игрока вместо независимого рандома.
            setIsMyTurn(user?.id ? user.id < partnerUserIdRef.current : Math.random() < 0.5);
          }
        }
        break;
      case 'question_asked':
        if (data.senderId !== user?.id) {
          const newQuestion: Question = {
            id: payload.questionId,
            question: payload.question,
            answer: null,
            askerId: data.senderId
          };
          setQuestions(prev => [...prev, newQuestion]);
        }
        break;
      case 'question_answered':
        setQuestions(prev =>
          prev.map(q =>
            q.id === payload.questionId
              ? { ...q, answer: payload.answer }
              : q
          )
        );
        setQuestionsLeft(prev => prev - 1);
        setIsMyTurn(prev => !prev);
        break;
      case 'final_guess':
        if (data.senderId !== user?.id) {
          const correct = payload.guess.toLowerCase().trim() === (myWordRef.current || '').toLowerCase().trim();
          sendGameMessage('guess_result', { correct, guesser: data.senderId });
          setGameResult(correct ? 'lost' : 'won');
          setGamePhase('finished');
          sendCompletedIfNeeded();
        }
        break;
      case 'guess_result':
        if (payload.guesser === user?.id) {
          setGameResult(payload.correct ? 'won' : 'lost');
          setGamePhase('finished');
          sendCompletedIfNeeded();
        }
        break;
    }
  }, [user?.id, sendGameMessage, sendCompletedIfNeeded]);

  useEffect(() => {
    const unsubscribe = subscribeWs((event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'game_action' && data.gameType === GameType.TWENTY_QUESTIONS) {
          handleGameMessage(data);
        } else if (data.type === 'partner_status_change') {
          wsStatusReceivedRef.current = true;
          setPartnerOnline(data.isOnline);
        }
      } catch {
        // ignore
      }
    });

    return unsubscribe;
  }, [handleGameMessage]);

  useEffect(() => {
    myWordRef.current = myWord;
  }, [myWord]);

  useEffect(() => {
    if (!wsStatusReceivedRef.current && partnerData?.partner?.isOnline != null) {
      setPartnerOnline(Boolean(partnerData.partner.isOnline));
    }
  }, [partnerData]);



  const handleSetWord = () => {
    if (myWord.trim()) {
      sendGameMessage('word_set', { word: myWord });
      if (partnerWordSetRef.current && user?.id) {
        // Партнёр уже загадал слово — сразу переходим к угадыванию.
        setGamePhase('guessing');
        setIsMyTurn(user.id < partnerUserIdRef.current);
      } else {
        setGamePhase('thinking');
        setWaitingForPartner(true);
      }
    }
  };

  const handleAskQuestion = () => {
    if (currentQuestion.trim() && questionsLeft > 0) {
      const questionId = Date.now().toString();
      const newQuestion: Question = {
        id: questionId,
        question: currentQuestion,
        answer: null,
        askerId: user?.id || ''
      };
      
      setQuestions(prev => [...prev, newQuestion]);
      sendGameMessage('question_asked', { question: currentQuestion, questionId });
      setCurrentQuestion('');
      setIsMyTurn(false);
    }
  };

  const handleAnswerQuestion = (questionId: string, answer: 'yes' | 'no') => {
    setQuestions(prev => 
      prev.map(q => 
        q.id === questionId 
          ? { ...q, answer }
          : q
      )
    );
    sendGameMessage('question_answered', { questionId, answer });
    setQuestionsLeft(prev => prev - 1);
  };

  const handleFinalGuess = () => {
    if (finalGuess.trim()) {
      sendGameMessage('final_guess', { guess: finalGuess });
      setWaitingForPartner(true);
    }
  };

  const getUnansweredQuestions = () => {
    return questions.filter(q => q.answer === null && q.askerId !== user?.id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={onBack} data-testid="button-back">
            ← Назад к играм
          </Button>
          <h1 className="text-3xl font-bold text-foreground mt-2">20 вопросов</h1>
          <p className="text-muted-foreground">Угадайте что загадал партнер</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <span className={`text-sm ${partnerOnline ? 'text-text-primary' : 'text-secondary'}`}>
              {partnerOnline ? 'Партнер в игре' : 'Ждем партнера...'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            <span className="text-sm">{questionsLeft} вопросов осталось</span>
          </div>
        </div>
      </div>

      {gamePhase === 'setup' && (
        <Card className="glass" data-testid="phase-setup">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Загадайте слово
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Загадайте любой предмет, животное, место или понятие. Ваш партнер будет задавать вопросы, 
              чтобы угадать что вы загадали.
            </p>
            <div className="space-y-3">
              <Input
                placeholder="Введите ваше слово..."
                value={myWord}
                onChange={(e) => setMyWord(e.target.value)}
                data-testid="input-word"
              />
              <Button 
                onClick={handleSetWord} 
                disabled={!myWord.trim() || !partnerOnline}
                className="w-full"
                data-testid="button-set-word"
              >
                Готово!
              </Button>
            </div>
            {!partnerOnline && (
              <div className="text-center text-muted-foreground">
                Ждем подключения партнера...
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {gamePhase === 'thinking' && (
        <Card className="glass" data-testid="phase-thinking">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
            <h3 className="text-xl font-semibold mb-2">Ждем партнера</h3>
            <p className="text-muted-foreground">
              Партнер тоже загадывает слово...
            </p>
          </CardContent>
        </Card>
      )}

      {gamePhase === 'guessing' && (
        <div className="space-y-6" data-testid="phase-guessing">
          {/* Questions History */}
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                История вопросов
              </CardTitle>
            </CardHeader>
            <CardContent>
              {questions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Вопросы появятся здесь
                </p>
              ) : (
                <div className="space-y-3">
                  {questions.map((q, index) => (
                    <div 
                      key={q.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border-subtle"
                    >
                      <div className="flex-1">
                        <span className="text-sm text-muted-foreground">#{index + 1}</span>
                        <p className="text-foreground">{q.question}</p>
                      </div>
                      {q.answer ? (
                        <Badge className={q.answer === 'yes' ? 'bg-primary' : 'bg-surface-hover'}>
                          {q.answer === 'yes' ? 'ДА' : 'НЕТ'}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Ожидание...</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {getUnansweredQuestions().length > 0 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle>Ответьте на вопросы партнера</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {getUnansweredQuestions().map((q) => (
                  <div key={q.id} className="p-4 border rounded-lg">
                    <p className="text-foreground mb-3">{q.question}</p>
                    <div className="flex gap-3">
                      <Button 
                        onClick={() => handleAnswerQuestion(q.id, 'yes')}
                        className="bg-primary hover:bg-accent-hover"
                        data-testid={`button-yes-${q.id}`}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        ДА
                      </Button>
                      <Button 
                        onClick={() => handleAnswerQuestion(q.id, 'no')}
                        variant="destructive"
                        data-testid={`button-no-${q.id}`}
                      >
                        <X className="h-4 w-4 mr-2" />
                        НЕТ
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {isMyTurn && questionsLeft > 0 && getUnansweredQuestions().length === 0 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle>Ваш ход - задайте вопрос</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Это живое существо?"
                  value={currentQuestion}
                  onChange={(e) => setCurrentQuestion(e.target.value)}
                  data-testid="input-question"
                />
                <Button 
                  onClick={handleAskQuestion} 
                  disabled={!currentQuestion.trim()}
                  className="w-full"
                  data-testid="button-ask-question"
                >
                  Задать вопрос
                </Button>
              </CardContent>
            </Card>
          )}

          {questionsLeft <= 0 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle>Время финальной догадки!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Вопросы закончились. Что загадал ваш партнер?
                </p>
                <Textarea
                  placeholder="Ваша финальная догадка..."
                  value={finalGuess}
                  onChange={(e) => setFinalGuess(e.target.value)}
                  data-testid="input-final-guess"
                />
                <Button 
                  onClick={handleFinalGuess} 
                  disabled={!finalGuess.trim() || waitingForPartner}
                  className="w-full"
                  data-testid="button-final-guess"
                >
                  Это мой ответ!
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {gamePhase === 'finished' && (
        <Card className="glass" data-testid="phase-finished">
          <CardContent className="p-8 text-center">
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
              gameResult === 'won' ? 'bg-primary' : 'bg-surface-hover'
            }`}>
              {gameResult === 'won' ? (
                <Check className="h-8 w-8 text-primary-foreground" />
              ) : (
                <X className="h-8 w-8 text-text-primary" />
              )}
            </div>
            <h3 className="text-2xl font-bold mb-2">
              {gameResult === 'won' ? 'Поздравляем! Вы выиграли!' : 'В этот раз не получилось'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {gameResult === 'won' 
                ? 'Вы отлично угадали слово партнера!' 
                : 'Может быть в следующий раз повезет больше!'}
            </p>
            <Button onClick={onBack} data-testid="button-back-finished">
              Вернуться к играм
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}