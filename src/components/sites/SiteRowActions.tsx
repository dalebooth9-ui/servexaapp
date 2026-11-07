import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MoreHorizontal, Plus, Pencil, Trash2 } from 'lucide-react';
export default function SiteRowActions({name,childType,onNewJob,onAdd,onEdit,onDelete}:{name:string;childType?:string;onNewJob:()=>void;onAdd:()=>void;onEdit:()=>void;onDelete:()=>void}) {
  return <div className="flex items-center gap-1 shrink-0 w-28" onClick={e=>e.stopPropagation()}>
    <Button size="sm" className="h-8 w-20 px-2" onClick={onNewJob}>New job</Button>
    <DropdownMenu><TooltipProvider delayDuration={250}><Tooltip>
      <TooltipTrigger asChild><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-7 shrink-0" aria-label={`Actions for ${name}`}><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger></TooltipTrigger>
      <TooltipContent>More actions</TooltipContent>
    </Tooltip></TooltipProvider>
      <DropdownMenuContent align="end">
        {childType && <DropdownMenuItem onClick={onAdd}><Plus className="h-4 w-4 mr-2"/>Add {childType}</DropdownMenuItem>}
        <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4 mr-2"/>Edit</DropdownMenuItem>
        <DropdownMenuSeparator/>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4 mr-2"/>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}