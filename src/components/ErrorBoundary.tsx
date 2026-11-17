import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface Props {
  children: ReactNode;
  resetKey?: unknown;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleCloseModal = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-black rounded-[32px] p-8 max-w-lg w-full text-center relative">
            <button
              onClick={this.handleCloseModal}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white border border-black hover:bg-black hover:text-white flex items-center justify-center transition"
              title="ปิดหน้าต่างนี้"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-16 h-16 rounded-full bg-[#fb4903] text-white mx-auto flex items-center justify-center border border-black mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="font-display font-black text-2xl text-black mb-2">
              เกิดข้อผิดพลาดในการโหลดเครื่องมือ
            </h2>
            <p className="text-xs text-gray-600 mb-6 leading-relaxed">
              ระบบได้ตรวจพบข้อผิดพลาดชั่วคราว ข้อมูลเอกสารของคุณยังคงปลอดภัย
              {this.state.error?.message && (
                <span className="block mt-2 p-2 bg-[#f4f3ec] border border-black rounded-xl font-mono text-[11px] text-[#fb4903] break-words">
                  {this.state.error.message}
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {this.props.onReset && (
                <button
                  onClick={this.handleCloseModal}
                  className="slush-pill bg-[#55db9c] text-black text-xs py-3 px-5 border border-black font-extrabold flex items-center justify-center gap-2"
                >
                  <span>ปิดและลองใหม่</span>
                </button>
              )}
              <button
                onClick={this.handleReload}
                className="slush-pill bg-black text-white text-xs py-3 px-5 border border-black font-extrabold flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4 text-[#55db9c]" />
                <span>รีโหลดหน้าเว็บ</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
