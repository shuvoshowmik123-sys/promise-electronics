import React from 'react';
import { Check, Lock, ArrowRight, XCircle, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface StatusStepperProps {
  steps: string[];
  currentStep: string;
  onAdvance?: (nextStep: string) => void;
  disabled?: boolean;
  formatStep?: (step: string) => string;
  // NEW PROPS:
  stepConfig?: readonly { value: string; label: string; tooltip: { title: string; body: string }; color: string; icon: string }[];
  terminalState?: string | null;  // "Declined" | "Cancelled" | "Unrepairable" | null
  onRollback?: () => void;
  onTerminal?: (state: string) => void;
}

export function StatusStepper({
  steps,
  currentStep,
  onAdvance,
  disabled = false,
  formatStep = (s) => s,
  stepConfig,
  terminalState,
  onRollback
}: StatusStepperProps) {
  const currentIndex = steps.indexOf(currentStep);
  const nextStep = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
  const isComplete = currentIndex === steps.length - 1;

  return (
    <div className="space-y-3">
      {/* Pipeline Row */}
      <div className="flex items-center w-full">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isLocked = index > currentIndex;

          return (
            <React.Fragment key={step}>
              {/* Node */}
              <div className="flex flex-col items-center relative group" style={{ minWidth: 0 }}>
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 border-2",
                  isCompleted && "bg-emerald-500 border-emerald-500",
                  isCurrent && "bg-blue-500 border-blue-500 ring-3 ring-blue-500/20",
                  isLocked && "bg-slate-100 border-slate-200",
                )}>
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  ) : isCurrent ? (
                    <div className="w-2 h-2 bg-white rounded-full" />
                  ) : (
                    <Lock className="w-2.5 h-2.5 text-slate-400" />
                  )}
                </div>

                {/* Tooltip on hover — only when stepConfig is provided */}
                {stepConfig && stepConfig[index] && (
                  <div className="absolute -top-16 left-1/2 -translate-x-1/2 hidden group-hover:block z-50 pointer-events-none">
                    <div className="bg-slate-900 text-white text-[10px] px-3 py-2 rounded-lg shadow-xl whitespace-nowrap max-w-[200px]">
                      <p className="font-semibold text-[11px]">{stepConfig[index].tooltip.title}</p>
                      <p className="text-slate-300 mt-0.5 whitespace-normal">{stepConfig[index].tooltip.body}</p>
                    </div>
                  </div>
                )}

                {/* Label below node */}
                <span className={cn(
                  "text-[9px] font-medium mt-1.5 text-center leading-tight",
                  isCurrent && "text-blue-600 font-bold",
                  isCompleted && "text-emerald-600",
                  isLocked && "text-slate-400",
                )} style={{ width: '60px', wordWrap: 'break-word' }}>
                  {formatStep(step)}
                </span>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 -mt-4 mx-0.5",
                  index < currentIndex ? "bg-emerald-500" : "bg-slate-200"
                )} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Advance Button */}
      {!disabled && nextStep && !isComplete && onAdvance && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            onClick={() => onAdvance(nextStep)}
          >
            Advance to {formatStep(nextStep)}
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      )}

      {isComplete && (
        <div className="flex justify-end">
          <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
            <Check className="w-3 h-3" /> Pipeline Complete
          </span>
        </div>
      )}

      {/* Terminal State Badge */}
      {terminalState && (
        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="w-4 h-4 text-red-500" />
          <span className="text-xs font-medium text-red-700">
            Terminal: {terminalState}
          </span>
        </div>
      )}
    </div>
  );
}

interface WorkflowStepperProps {
  steps: { value: string; label: string }[];
  currentValue: string;
  onAdvance?: (nextValue: string) => void;
  isBlocked?: boolean;
  blockReason?: string;
  jobLockedIndex?: number;  // Index at which job-dependent stages start
  isJobCreated?: boolean;
  // NEW PROPS:
  stepDetailConfig?: readonly { value: string; label: string; tooltip: { title: string; body: string }; skippable?: boolean; requiresJob?: boolean }[];
  onSkip?: (skipValue: string) => void;
  onRollback?: () => void;
  canRollback?: boolean;
}

export function WorkflowStepper({
  steps,
  currentValue,
  onAdvance,
  isBlocked = false,
  blockReason,
  jobLockedIndex,
  isJobCreated = true,
  stepDetailConfig,
  onSkip,
  onRollback,
  canRollback = false,
}: WorkflowStepperProps) {
  const currentIndex = steps.findIndex(s => s.value === currentValue);
  const nextStep = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
  const isComplete = currentIndex === steps.length - 1;

  // Check if next step is job-locked
  const isNextJobLocked = jobLockedIndex !== undefined && nextStep &&
    steps.indexOf(nextStep) >= jobLockedIndex && !isJobCreated;

  return (
    <div className="space-y-3">
      {/* Pipeline — wrap into 2 rows if many steps */}
      <div className="space-y-4">
        {/* Split into rows of 5 */}
        {[steps.slice(0, 5), steps.slice(5)].filter(row => row.length > 0).map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-center w-full">
            {row.map((step, index) => {
              const globalIndex = rowIdx === 0 ? index : index + 5;
              const isCompleted = globalIndex < currentIndex;
              const isCurrent = globalIndex === currentIndex;
              const isLocked = globalIndex > currentIndex || isBlocked;
              const isJobDep = jobLockedIndex !== undefined && globalIndex >= jobLockedIndex && !isJobCreated;

              return (
                <React.Fragment key={step.value}>
                  {/* Node */}
                  <div className="flex flex-col items-center relative group" style={{ minWidth: 0 }}>
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all border-2",
                      isCompleted && "bg-emerald-500 border-emerald-500",
                      isCurrent && "bg-blue-500 border-blue-500 ring-2 ring-blue-500/20",
                      isLocked && !isJobDep && "bg-slate-100 border-slate-200",
                      isJobDep && "bg-amber-50 border-amber-300",
                      // Skippable steps have dashed border when not completed/current
                      stepDetailConfig?.find(s => s.value === step.value)?.skippable && !isCompleted && !isCurrent && "border-dashed border-slate-300 bg-white",
                    )}>
                      {isCompleted ? (
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      ) : isCurrent ? (
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      ) : isJobDep ? (
                        <Lock className="w-2 h-2 text-amber-500" />
                      ) : (
                        <Lock className="w-2 h-2 text-slate-400" />
                      )}
                    </div>

                    {/* Rich tooltip on hover */}
                    {stepDetailConfig && stepDetailConfig.find(s => s.value === step.value) && (
                      <div className="absolute -top-16 left-1/2 -translate-x-1/2 hidden group-hover:block z-50 pointer-events-none">
                        <div className="bg-slate-900 text-white text-[10px] px-3 py-2 rounded-lg shadow-xl whitespace-nowrap max-w-[200px]">
                          <p className="font-semibold text-[11px]">{stepDetailConfig.find(s => s.value === step.value)?.tooltip.title}</p>
                          <p className="text-slate-300 mt-0.5 whitespace-normal">{stepDetailConfig.find(s => s.value === step.value)?.tooltip.body}</p>
                        </div>
                      </div>
                    )}

                    {/* Label */}
                    <span className={cn(
                      "text-[8px] font-medium mt-1 text-center leading-tight",
                      isCurrent && "text-blue-600 font-bold",
                      isCompleted && "text-emerald-600",
                      isLocked && !isJobDep && "text-slate-400",
                      isJobDep && "text-amber-500",
                    )} style={{ width: '52px', wordWrap: 'break-word' }}>
                      {step.label}
                    </span>

                    {/* Job-locked tooltip */}
                    {isJobDep && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-50">
                        <div className="bg-slate-800 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap shadow-lg">
                          Requires Job Ticket
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Connector */}
                  {index < row.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 -mt-3.5 mx-0.5",
                      globalIndex < currentIndex ? "bg-emerald-500" : "bg-slate-200"
                    )} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>

      {/* Advance Button */}
      {!isBlocked && nextStep && !isComplete && !isNextJobLocked && onAdvance && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] rounded-lg border-blue-200 text-blue-600 hover:bg-blue-50"
            onClick={() => onAdvance(nextStep.value)}
          >
            Advance to {nextStep.label}
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      )}

      {isNextJobLocked && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
          <Lock className="w-3 h-3 shrink-0" />
          Next stage requires a Job Ticket. Convert internal status to "Job Created" first.
        </div>
      )}

      {isComplete && (
        <div className="flex justify-end">
          <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
            <Check className="w-3 h-3" /> Tracking Complete
          </span>
        </div>
      )}

      {/* Rollback Button */}
      {canRollback && onRollback && !isComplete && (
        <div className="flex justify-start pt-2 border-t border-slate-200">
          <button
            onClick={onRollback}
            className="text-[10px] text-rose-500 hover:text-rose-600 hover:underline flex items-center gap-1"
          >
            <Undo2 className="w-3 h-3" /> Go Back
          </button>
        </div>
      )}
    </div>
  );
}
