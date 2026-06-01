import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class SseService {
  constructor() {}

  private readonly Stream = new Subject<{
    signal?: string;
    boothId?: string;
    shiftId?: string;
  }>();

  triggerRefreshShiftId(id: string) {
    this.Stream.next({ shiftId: id });
  }

  triggerRefreshBoothId(id: string) {
    this.Stream.next({ boothId: id });
  }

  triggerRefreshSignal() {
    this.Stream.next({ signal: 'refresh' });
  }

  getRefreshSignal(): Observable<{ signal?: string; boothId?: string }> {
    return this.Stream.asObservable();
  }
}
