import { Controller, Sse, UseGuards, MessageEvent } from "@nestjs/common";
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Observable , map} from "rxjs";
import { SseService } from "./sse.service";

@Controller('sse')
export class SseController {
    constructor(private readonly sseService: SseService) {}

    @Sse('refresh-signal')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles("ADMIN" , "MANAGER" , "EMPLOYEE")
    connectToSse()  : Observable<MessageEvent> {
        return this.sseService.getRefreshSignal().pipe(
            map((signal) => ({ data:  JSON.stringify(signal) }))
        );
    }
}