import { useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, GraduationCap, ChevronRight, Check } from "lucide-react";
import { useListSubjects, useOnboardUser, getGetUserProfileQueryKey } from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { BrandLogo } from "@/components/brand-logo";

export default function Onboarding() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [level, setLevel] = useState<"O_LEVEL" | "A_LEVEL" | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<number[]>([]);
  const queryClient = useQueryClient();

  const { data: subjects, isLoading: isLoadingSubjects } = useListSubjects(
    level ? { level } : undefined,
    { query: { enabled: !!level, queryKey: ["subjects", level] } }
  );

  const onboardMutation = useOnboardUser();

  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if (user.onboarded) return <Redirect to="/dashboard" />;

  const handleComplete = () => {
    if (!level) return;
    onboardMutation.mutate(
      { data: { level, subjectIds: selectedSubjects } },
      {
        onSuccess: (updatedUser) => {
          queryClient.setQueryData(getGetUserProfileQueryKey(), updatedUser);
          setLocation("/dashboard");
        },
      }
    );
  };

  const toggleSubject = (id: number) => {
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] flex flex-col">
      <header className="p-6 flex items-center justify-between">
        <BrandLogo imageClassName="h-10 w-auto" />
        <div className="text-sm font-medium text-gray-500">Step {step} of 3</div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-4">
                  <h1 className="text-4xl font-bold text-[#0B1F3A]">What are you studying?</h1>
                  <p className="text-lg text-gray-500">Select your current academic level.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {(["O_LEVEL", "A_LEVEL"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setLevel(lvl)}
                      className={`p-8 text-center rounded-2xl border-2 transition-all cursor-pointer bg-white hover:border-[#0B1F3A] ${
                        level === lvl ? "border-[#0B1F3A] ring-2 ring-[#0B1F3A]/20 bg-[#0B1F3A]/5" : "border-gray-200"
                      }`}
                    >
                      {lvl === "O_LEVEL" ? (
                        <GraduationCap className={`h-12 w-12 mx-auto mb-4 ${level === lvl ? "text-[#0B1F3A]" : "text-gray-400"}`} />
                      ) : (
                        <BookOpen className={`h-12 w-12 mx-auto mb-4 ${level === lvl ? "text-[#0B1F3A]" : "text-gray-400"}`} />
                      )}
                      <h3 className="text-2xl font-bold text-[#0B1F3A]">{lvl === "O_LEVEL" ? "O Level" : "A Level"}</h3>
                      <p className="text-gray-500 mt-2">{lvl === "O_LEVEL" ? "Cambridge O Level / IGCSE" : "Cambridge AS & A Level"}</p>
                    </button>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    disabled={!level}
                    onClick={() => setStep(2)}
                    className="bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 text-white rounded-full px-8 py-3 font-semibold transition-colors disabled:opacity-40 flex items-center gap-2"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-4">
                  <h1 className="text-4xl font-bold text-[#0B1F3A]">Select your subjects</h1>
                  <p className="text-lg text-gray-500">Pick the subjects you want to focus on.</p>
                </div>

                {isLoadingSubjects ? (
                  <div className="flex justify-center p-12 text-gray-400">Loading subjects...</div>
                ) : subjects?.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-gray-500">
                    No subjects are available yet. Add subjects in Supabase, then return to complete setup.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[50vh] overflow-y-auto p-2">
                    {subjects?.map((subject) => {
                      const isSelected = selectedSubjects.includes(subject.id);
                      return (
                        <button
                          key={subject.id}
                          onClick={() => toggleSubject(subject.id)}
                          className={`cursor-pointer bg-white overflow-hidden relative rounded-xl border-2 p-4 pl-6 text-left transition-all ${
                            isSelected ? "border-[#0B1F3A] ring-2 ring-[#0B1F3A]/20" : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ backgroundColor: subject.color }} />
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-bold text-[#0B1F3A]">{subject.name}</div>
                              <div className="text-xs text-gray-500">{subject.code}</div>
                            </div>
                            {isSelected && <Check className="h-5 w-5 text-[#0B1F3A]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <button onClick={() => setStep(1)} className="text-gray-500 hover:text-[#0B1F3A] px-4 py-2 font-medium transition-colors">
                    Back
                  </button>
                  <button
                    disabled={selectedSubjects.length === 0}
                    onClick={() => setStep(3)}
                    className="bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 text-white rounded-full px-8 py-3 font-semibold transition-colors disabled:opacity-40 flex items-center gap-2"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8 text-center"
              >
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <Check className="h-12 w-12 text-green-600" />
                </div>
                <h1 className="text-4xl font-bold text-[#0B1F3A]">You're all set!</h1>
                <p className="text-lg text-gray-500 max-w-md mx-auto">
                  Your level and subjects will be saved to your Parhai profile.
                </p>
                <div className="pt-8">
                  <button
                    onClick={handleComplete}
                    disabled={onboardMutation.isPending}
                    className="bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-white rounded-full px-12 h-14 text-lg shadow-lg shadow-[#06B6D4]/25 transition-colors font-semibold disabled:opacity-60"
                  >
                    {onboardMutation.isPending ? "Setting up..." : "Go to Dashboard"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
