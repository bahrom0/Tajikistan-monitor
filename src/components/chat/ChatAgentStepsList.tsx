import type { AgentStep } from '../../types/chat';
import { SearchIcon, GlobeIcon, BrainIcon, RefreshIcon, CheckIcon, AppleSpinner } from '../icons';

interface ChatAgentStepsListProps {
  steps?: AgentStep[];
  isStreaming?: boolean;
}

export function ChatAgentStepsList({ steps = [], isStreaming = false }: ChatAgentStepsListProps) {
  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <div class="chat-agent-steps-wrapper" aria-label="Этапы работы агента">
      <div class="chat-agent-steps-list">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isActive = isStreaming && isLast;

          return (
            <div key={step.id || `step-${index}`} class={`chat-agent-step-chip is-${step.stage}${isActive ? ' is-active' : ''}`}>
              <span class="chat-agent-step-icon">
                {step.stage === 'search' && <SearchIcon size={12} />}
                {step.stage === 'reading' && <GlobeIcon size={12} />}
                {step.stage === 'thinking' && <BrainIcon size={12} />}
                {step.stage === 'refining' && <RefreshIcon size={12} />}
                {step.stage === 'done' && <CheckIcon size={12} />}
              </span>

              <div class="chat-agent-step-content">
                <span class="chat-agent-step-label">{step.label}</span>
                {step.count !== undefined && step.count > 0 && (
                  <span class="chat-agent-step-count">({step.count})</span>
                )}
              </div>

              {isActive && (
                <AppleSpinner size={11} class="chat-agent-step-spinner" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
